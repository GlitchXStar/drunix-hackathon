import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateNotificationParams {
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(params: CreateNotificationParams) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          entityType: params.entityType,
          entityId: params.entityId,
          createdAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to create in-app notification: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async getForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }
}
