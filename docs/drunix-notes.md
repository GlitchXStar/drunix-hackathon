# Drunix Notes & Compatibility Discovery

This document records factual, evidence-based notes on the NPCI Drunix network, Fabric Gateway compatibility, commands, ports, and configuration discovered from the official Drunix repository in `infra/drunix/`.

> **CRITICAL RULE:** Do not invent or guess Drunix commands, ports, or APIs. All entries reference exact file paths and actual verified behavior.

---

## 1. Drunix Architecture Overview

- **Source:** [infra/drunix/docs/drunix-arch.md](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/docs/drunix-arch.md)
- **Peer Segregation:** Drunix decouples standard Fabric peers into two distinct roles:
  1. **Lite Peer (LP):** Handles client transaction proposals, chaincode simulation, and endorsement. Stateless with no local ledger storage.
  2. **Committing Peer (CP):** Handles block validation, Multi-Version Concurrency Control (MVCC) verification, coordination with the Validation Service, and ledger block commitment.
- **State Database:** Supports **YugabyteDB** (SQL distributed database, port `5433`) in addition to NoSQL (LevelDB/CouchDB).
- **Transient Store:** Shared **KeyDB** (Redis-compatible, port `6379`) between LP and CP within an org, eliminating inter-peer transient private data replication overhead.
- **Stateless Validation Service (VS):** Decoupled validation servers (`peer2`) performing policy acceptance checks and cryptographic signature verifications in parallel.

---

## 2. Test Network Operations

- **Source:** [infra/drunix/drunix-network/test-network/network.sh](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/network.sh) and [README.md](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/README.md)
- **Starting the network:**
  ```bash
  ./network.sh up createChannel -c mychannel -s yugabyte
  ```
- **Stopping the network:**
  ```bash
  ./network.sh down
  ```
- **Restarting the network:**
  ```bash
  ./network.sh restart
  ```
- **Prerequisites check:**
  ```bash
  ./network.sh prereq
  ```
  Prerequisites: Linux environment, Docker version <= 28, Golang, jq.
- **Docker Compose Definitions:**
  - Base network: [infra/drunix/drunix-network/test-network/compose/compose-test-net.yaml](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/compose/compose-test-net.yaml)
  - Certificate Authorities: [infra/drunix/drunix-network/test-network/compose/compose-ca.yaml](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/compose/compose-ca.yaml)

---

## 3. Network Ports & Containers

Discovered from [infra/drunix/drunix-network/test-network/compose/compose-test-net.yaml](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/compose/compose-test-net.yaml):

| Service | Container Name | Image | Host Port | Internal Port | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Orderer** | `orderer.example.com` | `npcioss/drunix-orderer:1.0.0` | `7050`, `7053`, `9443` | 7050, 7053, 9443 | Raft Ordering Node (General, Admin, Metrics) |
| **Org1 LP** | `lp1.org1` (`peer0.org1.example.com`) | `npcioss/drunix-peer:1.0.0` | `7051` | 7051 | Org1 Lite Peer (Endorsement & Client Gateway) |
| **Org1 CP** | `cp.org1` (`peer1.org1.example.com`) | `npcioss/drunix-peer:1.0.0` | `7061` | 7061 | Org1 Committing Peer (Validation & Commit) |
| **Org1 VS** | `vs1.org1` (`peer2.org1.example.com`) | `npcioss/drunix-vscc:1.0.0` | `7071` | 7071 | Org1 Stateless Validation Service |
| **Org1 KeyDB**| `hlf_keydb_org1msp` | KeyDB | `6379` | 6379 | Transient Private Data Store |
| **Org1 DB** | `yugabyte-org1` | YugabyteDB | `5433` | 5433 | Relational World State DB |
| **Org2 LP** | `lp1.org2` (`peer0.org2.example.com`) | `npcioss/drunix-peer:1.0.0` | `9051` | 9051 | Org2 Lite Peer |
| **Org2 CP** | `cp.org2` (`peer1.org2.example.com`) | `npcioss/drunix-peer:1.0.0` | `9061` | 9061 | Org2 Committing Peer |
| **Org2 VS** | `vs1.org2` (`peer2.org2.example.com`) | `npcioss/drunix-vscc:1.0.0` | `9071` | 9071 | Org2 Stateless Validation Service |

---

## 4. Multi-Org Topology (Default vs TrustLedger 3-Org Requirement)

- **Default Drunix Out-of-the-Box Topology:**
  - Orderer: `OrdererMSP` (container `orderer.example.com`)
  - Two organizations only: `Org1MSP` and `Org2MSP` (defined in `configtx/configtx.yaml` and `organizations/cryptogen/`).
  - No 3-org setup exists in `infra/drunix` by default.
- **TrustLedger Requirement (3 Orgs):**
  - Requires adding a 3rd organization to Drunix: `PlatformOrg` (platform operator), `BankAOrg` (issuing bank), and `NbfcOrg` (inquiring NBFC) with MSP IDs `PlatformOrgMSP`, `BankAOrgMSP`, `NbfcOrgMSP`.
  - Alternatively, in a two-org prototype simplification, `Org1MSP` and `Org2MSP` can represent `PlatformOrg` and `BankAOrg`, while `NbfcOrg` is added as `Org3MSP`.
  - **Unresolved Implementation Assumption:** Running a full 3-org Drunix network requires 16 active containers (1 Orderer + 3 Lite Peers + 3 Committing Peers + 3 Validation Services + 3 KeyDB transient stores + 3 YugabyteDB instances).
- **Port Mapping for TrustLedger:**
  - `Org1` (e.g. `PlatformOrg`): LP `7051`, CP `7061`, VS `7071`, KeyDB `6379`, DB `5433`
  - `Org2` (e.g. `BankAOrg`): LP `9051`, CP `9061`, VS `9071`, KeyDB `6380`, DB `5434`
  - `Org3` (e.g. `NbfcOrg` - to be created): Suggested LP `11051`, CP `11061`, VS `11071`


---

## 5. Chaincode Deployment

- **Source:** [infra/drunix/drunix-network/test-network/network.sh:L87-L107](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/network.sh#L87-L107)
- **Command:**
  ```bash
  ./network.sh deployCC -c trustledgerchannel \
    -ccn trustledger \
    -ccp ../../../backend/chaincode/trustledger \
    -ccl go \
    -ccv 1.0 \
    -ccs 1 \
    -ccep "AND('PlatformOrgMSP.peer', OR('BankAOrgMSP.peer', 'NbfcOrgMSP.peer'))"
  ```
- **Invocation & Query CLI:**
  - Invoke: `./network.sh cc invoke -c mychannel -ccn trustledger -ccic '{"Args":["RegisterBusiness","uuid-123"]}'`
  - Query: `./network.sh cc query -c mychannel -ccn trustledger -ccqc '{"Args":["CheckAccess","consent-123","BankAOrgMSP","DOCUMENTS","doc-456"]}'`

---

## 6. Supported Fabric Gateway Client for Node

- **Source:** [infra/drunix/drunix-network/asset-transfer-basic/rest-api-typescript/package.json:L16](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/asset-transfer-basic/rest-api-typescript/package.json#L16)
- **Library:** `fabric-network: ^2.2.20` or `@hyperledger/fabric-gateway: ^1.4.0`
- **Identity & Wallet Construction:**
  Evidence from [infra/drunix/drunix-network/asset-transfer-basic/rest-api-typescript/src/fabric.ts:L31-L57](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/asset-transfer-basic/rest-api-typescript/src/fabric.ts#L31-L57):
  ```typescript
  import { Wallets, Gateway } from 'fabric-network';

  const wallet = await Wallets.newInMemoryWallet();
  await wallet.put('PlatformOrgMSP', {
    credentials: {
      certificate: certPemString,
      privateKey: keyPemString,
    },
    mspId: 'PlatformOrgMSP',
    type: 'X.509',
  });
  ```
- **Connecting Gateway:**
  ```typescript
  const gateway = new Gateway();
  await gateway.connect(connectionProfile, {
    wallet,
    identity: 'PlatformOrgMSP',
    discovery: { enabled: true, asLocalhost: true },
  });
  const network = await gateway.getNetwork('trustledgerchannel');
  const contract = network.getContract('trustledger');
  ```

---

## 7. Endorsement Policy Syntax

- **Source:** [infra/drunix/drunix-network/test-network/configtx/configtx.yaml:L61-L63](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/configtx/configtx.yaml#L61-L63) and [README.md:L119-L151](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/drunix-network/test-network/README.md#L119-L151)
- **Syntax:**
  - Standard boolean expression of MSP roles: `AND('PlatformOrgMSP.peer', 'BankAOrgMSP.peer')`
  - Institution-issued writes require `PlatformOrgMSP` endorsement plus the acting institution MSP.
  - Platform writes require `PlatformOrgMSP.peer`.

---

## 8. Timestamp Handling for Read-Only Evaluate Calls

- **Source:** [infra/drunix/docs/drunix-arch.md:L142-L154](file:///c:/Users/Gaurav%20Tiple/drunix-hackathon/infra/drunix/docs/drunix-arch.md#L142-L154)
- **Mechanism:**
  - In Drunix, evaluate calls (`EvaluateTransaction`) are simulated only on the Lite Peer (LP) and are never submitted to the orderer or written to blocks.
  - The transaction timestamp inside Go chaincode (`stub.GetTxTimestamp()`) for evaluate calls is derived from the client's proposal header timestamp.
  - For submitted write transactions (`SubmitTransaction`), the proposal timestamp is embedded into the channel header and validated during ordering and CP validation, ensuring immutable deterministic transaction times across all committing peers.

---

## 9. Current Verification Status & Blockers

- **Discovery Status:** COMPLETED. Architecture, peer segregation, ports, and Fabric Gateway dependencies verified from repository source.
- **Live Network Verification:** UNVERIFIED / BLOCKED.
  - Docker is not installed on this host environment.
  - `./network.sh up` and chaincode deployment have **not** been executed against running containers.
  - `infra/scripts/test-multi-org.ts` is an **in-memory mock simulation** verifying contract call workflows, NOT a live blockchain gRPC client test.
- **Blocker:** Starting the actual Drunix network requires Docker / Docker Desktop to be installed and running on the host system.

