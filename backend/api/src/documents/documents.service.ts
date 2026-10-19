import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  StorageProvider,
  KeyProvider,
  STORAGE_PROVIDER,
  KEY_PROVIDER,
} from '../storage/storage.interface';
import { LedgerService, LEDGER_SERVICE } from '../ledger/ledger.interface';
import { UploadedFileDto, validateDocumentFile } from './file-validator';

export interface DecryptedDocumentResult {
  buffer: Buffer;
  mime: string;
  docRef: string;
  docType: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(KEY_PROVIDER) private readonly keyProvider: KeyProvider,
    @Inject(LEDGER_SERVICE) private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Section 7 & W1: Upload Document Pipeline
   */
  async uploadDocument(
    businessId: string,
    docType: string,
    file: UploadedFileDto,
    actorEmail: string,
  ) {
    if (!docType || typeof docType !== 'string') {
      throw new BadRequestException('docType is required');
    }

    const { mime } = validateDocumentFile(file);

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException(`Business with id ${businessId} not found`);
    }

    // 1. Generate salt and salted hash: contentHash = SHA-256(plaintext || salt)
    const salt = crypto.randomBytes(32);
    const contentHash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .update(salt)
      .digest('hex');

    // 2. Encrypt salt with master key
    const encryptedSalt = await this.keyProvider.encryptSalt(salt);

    // 3. Generate random 256-bit DEK & AES-256-GCM encrypt
    const plainDek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', plainDek, iv);
    const ciphertext = Buffer.concat([cipher.update(file.buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 4. Wrap DEK with master key
    const wrappedDek = await this.keyProvider.wrapKey(plainDek);

    // 5. Store ciphertext under opaque UUID in StorageProvider
    const storageKey = uuidv4();
    await this.storageProvider.store(storageKey, ciphertext);

    // 6. Create document in DB with status PENDING_REGISTRATION
    const docRef = uuidv4();
    let doc;
    try {
      doc = await this.prisma.document.create({
        data: {
          docRef,
          businessId,
          docType,
          status: 'PENDING_REGISTRATION',
          storageKey,
          wrappedDek,
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex'),
          salt: encryptedSalt,
          contentHash,
          mime,
          sizeBytes: file.buffer.length,
          version: 1,
        },
      });
    } catch (dbErr) {
      // Clean up orphaned storage object if database record creation fails
      await this.storageProvider.delete(storageKey).catch(() => {});
      throw dbErr;
    }

    // 7. Register on ledger as PlatformOrg
    let ledgerTxId = '';
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'RegisterDocument',
        docRef,
        business.businessRef,
        docType,
        contentHash,
      );

      // On commit, transition to REGISTERED
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'REGISTERED' },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Handle idempotent commit (ledger committed previously but DB update was interrupted)
      if (errMsg.includes('already registered with identical contentHash')) {
        await this.prisma.document.update({
          where: { id: doc.id },
          data: { status: 'REGISTERED' },
        });
      } else {
        this.logger.error(`Ledger registration failed for document ${docRef}:`, err);
        // Document remains PENDING_REGISTRATION (W1)
        throw new BadRequestException(
          `Ledger registration failed: ${errMsg}. Document retained in PENDING_REGISTRATION state.`,
        );
      }
    }

    // 8. Write audit record (I-6)
    await this.auditService.record({
      actor: actorEmail,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: doc.id,
      businessId,
      ledgerTxId,
      metadata: {
        docRef,
        docType,
        mime,
        sizeBytes: file.buffer.length,
        version: 1,
      },
    });

    return {
      id: doc.id,
      docRef: doc.docRef,
      businessId: doc.businessId,
      docType: doc.docType,
      status: 'REGISTERED',
      contentHash: doc.contentHash,
      mime: doc.mime,
      sizeBytes: doc.sizeBytes,
      version: doc.version,
      createdAt: doc.createdAt,
    };
  }

  /**
   * Section 7, 10 (W1), D-12: Replace Document (new version n+1)
   */
  async replaceDocument(
    businessId: string,
    docId: string,
    file: UploadedFileDto,
    actorEmail: string,
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, businessId },
    });
    if (!doc || doc.status === 'DELETED') {
      throw new NotFoundException('Document not found');
    }

    // D-12 & S-14 Active Consent Protection
    await this.assertNoActiveConsent(doc.docRef);

    const { mime } = validateDocumentFile(file);

    // 1. Salt and salted hash for replacement
    const salt = crypto.randomBytes(32);
    const contentHash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .update(salt)
      .digest('hex');

    const encryptedSalt = await this.keyProvider.encryptSalt(salt);

    // 2. Encrypt new ciphertext
    const plainDek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', plainDek, iv);
    const ciphertext = Buffer.concat([cipher.update(file.buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const wrappedDek = await this.keyProvider.wrapKey(plainDek);

    // 3. Store new ciphertext
    const newStorageKey = uuidv4();
    await this.storageProvider.store(newStorageKey, ciphertext);

    // 4. Update on ledger (ReplaceDocument creates version n+1)
    let ledgerTxId = '';
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'ReplaceDocument',
        doc.docRef,
        contentHash,
      );
    } catch (err) {
      await this.storageProvider.delete(newStorageKey).catch(() => {});
      throw new BadRequestException(
        `Ledger replacement failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 5. Update database record FIRST to point to newStorageKey and version n+1
    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: {
        storageKey: newStorageKey,
        wrappedDek,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        salt: encryptedSalt,
        contentHash,
        mime,
        sizeBytes: file.buffer.length,
        version: doc.version + 1,
      },
    });

    // 6. Delete old ciphertext from storage only after DB update succeeds
    await this.storageProvider.delete(doc.storageKey).catch((delErr) => {
      this.logger.warn(`Failed to prune old ciphertext ${doc.storageKey}: ${delErr}`);
    });

    await this.auditService.record({
      actor: actorEmail,
      action: 'DOCUMENT_REPLACED',
      entityType: 'Document',
      entityId: doc.id,
      businessId,
      ledgerTxId,
      metadata: {
        docRef: doc.docRef,
        docType: doc.docType,
        newVersion: updated.version,
      },
    });

    return {
      id: updated.id,
      docRef: updated.docRef,
      businessId: updated.businessId,
      docType: updated.docType,
      status: updated.status,
      contentHash: updated.contentHash,
      mime: updated.mime,
      sizeBytes: updated.sizeBytes,
      version: updated.version,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Section 10 W1: Retry registration of a document stuck in PENDING_REGISTRATION
   */
  async retryRegistration(businessId: string, docId: string, actorEmail: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, businessId },
    });
    if (!doc || doc.status === 'DELETED') {
      throw new NotFoundException('Document not found');
    }

    if (doc.status === 'REGISTERED') {
      return {
        id: doc.id,
        docRef: doc.docRef,
        status: doc.status,
        message: 'Document is already registered on ledger',
      };
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    let ledgerTxId = '';
    try {
      ledgerTxId = await this.ledgerService.submitTransaction(
        'PlatformOrgMSP',
        'RegisterDocument',
        doc.docRef,
        business.businessRef,
        doc.docType,
        doc.contentHash,
      );

      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'REGISTERED' },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('already registered with identical contentHash')) {
        await this.prisma.document.update({
          where: { id: doc.id },
          data: { status: 'REGISTERED' },
        });
      } else {
        throw new BadRequestException(`Ledger registration retry failed: ${errMsg}`);
      }
    }

    await this.auditService.record({
      actor: actorEmail,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: doc.id,
      businessId,
      ledgerTxId,
      metadata: {
        docRef: doc.docRef,
        retry: true,
      },
    });

    return {
      id: doc.id,
      docRef: doc.docRef,
      status: 'REGISTERED',
      message: 'Document registered successfully on ledger',
    };
  }

  /**
   * Section 7, 10 (W1), D-12: Delete Document (Crypto-shredding)
   */
  async deleteDocument(businessId: string, docId: string, actorEmail: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, businessId },
    });
    if (!doc || doc.status === 'DELETED') {
      throw new NotFoundException('Document not found');
    }

    // D-12 & S-14 Active Consent Protection
    await this.assertNoActiveConsent(doc.docRef);

    // Crypto-shredding:
    // 1. Shred wrapped DEK, salt, IV, and authTag in DB FIRST
    await this.prisma.document.update({
      where: { id: doc.id },
      data: {
        status: 'DELETED',
        storageKey: '',
        wrappedDek: '',
        salt: '',
        iv: '',
        authTag: '',
        deletedAt: new Date(),
      },
    });

    // 2. Prune ciphertext from storage
    if (doc.storageKey) {
      await this.storageProvider.delete(doc.storageKey).catch((delErr) => {
        this.logger.warn(`Failed to prune storage key ${doc.storageKey}: ${delErr}`);
      });
    }

    await this.auditService.record({
      actor: actorEmail,
      action: 'DOCUMENT_DELETED',
      entityType: 'Document',
      entityId: doc.id,
      businessId,
      metadata: {
        docRef: doc.docRef,
        docType: doc.docType,
        cryptoShredded: true,
      },
    });

    return { success: true, message: 'Document crypto-shredded successfully' };
  }

  /**
   * Section 7 Release Flow: Ledger CheckAccess -> Decrypt -> Recompute Hash (S-9 Tamper Detection)
   */
  async releaseDocumentForSession(
    consentId: string,
    institutionId: string,
    docRef: string,
  ): Promise<DecryptedDocumentResult> {
    // I-1 Fail closed: Check ledger access first
    let accessCheck;
    try {
      accessCheck = await this.ledgerService.checkAccess(
        consentId,
        institutionId,
        'DOCUMENTS',
        docRef,
      );
    } catch (err) {
      throw new ForbiddenException({
        code: 'LEDGER_UNAVAILABLE',
        message: 'Ledger unreachable during access check (I-1 fail closed)',
      });
    }

    if (!accessCheck || !accessCheck.allowed) {
      const code = accessCheck?.reasonCode || 'ACCESS_DENIED';
      throw new ForbiddenException({
        code,
        message: `Ledger access denied: ${code}`,
      });
    }

    // Find document
    const doc = await this.prisma.document.findUnique({
      where: { docRef },
    });
    if (!doc || doc.status === 'DELETED') {
      throw new NotFoundException('Document not found or deleted');
    }
    // W1: A document is not shareable until REGISTERED
    if (doc.status !== 'REGISTERED') {
      throw new ForbiddenException({
        code: 'DOCUMENT_NOT_READY',
        message: 'Document is not yet registered on ledger (W1)',
      });
    }

    // Retrieve ciphertext from storage
    let ciphertext: Buffer;
    try {
      ciphertext = await this.storageProvider.retrieve(doc.storageKey);
    } catch {
      throw new NotFoundException('Document storage object not found');
    }

    // Decrypt DEK and salt
    const plainDek = await this.keyProvider.unwrapKey(doc.wrappedDek);
    const salt = await this.keyProvider.decryptSalt(doc.salt);

    // Decrypt ciphertext with AES-256-GCM
    let plaintext: Buffer;
    try {
      const iv = Buffer.from(doc.iv, 'hex');
      const tag = Buffer.from(doc.authTag, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', plainDek, iv);
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (err) {
      // S-9 Ciphertext was modified in storage
      await this.auditService.record({
        actor: institutionId,
        action: 'INTEGRITY_MISMATCH',
        entityType: 'Document',
        entityId: doc.docRef,
        metadata: {
          docRef: doc.docRef,
          consentId,
          error: 'AES-256-GCM authentication tag verification failed',
        },
      });
      throw new ForbiddenException({
        code: 'INTEGRITY_MISMATCH',
        message: 'Document ciphertext failed integrity check (S-9)',
      });
    }

    // Recompute salted hash and verify against ledger/DB hash
    const recomputedHash = crypto
      .createHash('sha256')
      .update(plaintext)
      .update(salt)
      .digest('hex');

    if (recomputedHash !== doc.contentHash) {
      await this.auditService.record({
        actor: institutionId,
        action: 'INTEGRITY_MISMATCH',
        entityType: 'Document',
        entityId: doc.docRef,
        metadata: {
          docRef: doc.docRef,
          consentId,
          error: 'Recomputed content hash does not match ledger contentHash',
        },
      });
      throw new ForbiddenException({
        code: 'INTEGRITY_MISMATCH',
        message: 'Document content hash mismatch (S-9)',
      });
    }

    return {
      buffer: plaintext,
      mime: doc.mime,
      docRef: doc.docRef,
      docType: doc.docType,
    };
  }

  /**
   * Owner views their own document (no consent needed, but decrypt & verify integrity)
   */
  async viewDocumentByOwner(
    businessId: string,
    docId: string,
  ): Promise<DecryptedDocumentResult> {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, businessId },
    });
    if (!doc || doc.status === 'DELETED') {
      throw new NotFoundException('Document not found or deleted');
    }

    const ciphertext = await this.storageProvider.retrieve(doc.storageKey);
    const plainDek = await this.keyProvider.unwrapKey(doc.wrappedDek);
    const salt = await this.keyProvider.decryptSalt(doc.salt);

    const iv = Buffer.from(doc.iv, 'hex');
    const tag = Buffer.from(doc.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', plainDek, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const recomputedHash = crypto
      .createHash('sha256')
      .update(plaintext)
      .update(salt)
      .digest('hex');

    if (recomputedHash !== doc.contentHash) {
      throw new ForbiddenException({
        code: 'INTEGRITY_MISMATCH',
        message: 'Document content hash mismatch',
      });
    }

    return {
      buffer: plaintext,
      mime: doc.mime,
      docRef: doc.docRef,
      docType: doc.docType,
    };
  }

  async listDocuments(businessId: string) {
    const docs = await this.prisma.document.findMany({
      where: { businessId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        docRef: true,
        businessId: true,
        docType: true,
        status: true,
        contentHash: true,
        mime: true,
        sizeBytes: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return docs;
  }

  async getDocumentById(businessId: string, docId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, businessId },
      select: {
        id: true,
        docRef: true,
        businessId: true,
        docType: true,
        status: true,
        contentHash: true,
        mime: true,
        sizeBytes: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!doc || doc.status === 'DELETED') {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  /**
   * D-12 & S-14 Active Consent Protection
   * Blocks replacing or deleting a document while an active consent references it.
   */
  private async assertNoActiveConsent(docRef: string): Promise<void> {
    const now = new Date();
    const activeConsent = await this.prisma.consentGrant.findFirst({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: now },
        docRefs: { has: docRef },
      },
    });

    if (activeConsent) {
      throw new ConflictException({
        code: 'ACTIVE_CONSENT_CONFLICT',
        message:
          'Cannot replace or delete document while an ACTIVE consent references it (D-12). The owner must revoke the consent first.',
      });
    }
  }
}
