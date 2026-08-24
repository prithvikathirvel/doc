import { DocumentService } from "../service/documentService";
import { FolderService } from "../service/folderService";
import { PermissionService } from "../service/permissionService";
import { StorageResolver } from "../service/storageResolver";
import { TenantService } from "../service/tenantService";
import { MysqlAnalyticsRepository } from "../dao/mysql/MysqlAnalyticsRepository";
import { MysqlAuditLogger } from "../dao/mysql/MysqlAuditLogger";
import { MysqlDocumentRepository } from "../dao/mysql/MysqlDocumentRepository";
import { MysqlFolderRepository } from "../dao/mysql/MysqlFolderRepository";
import { MysqlPermissionRepository } from "../dao/mysql/MysqlPermissionRepository";
import { MysqlTenantRepository } from "../dao/mysql/MysqlTenantRepository";
import { MysqlDirectoryRepository, MysqlLegacyActivityClaimer } from "../dao/mysql/MysqlDirectoryRepository";
import { MysqlTenantDocRepository } from "../dao/mysql/MysqlTenantDocRepository";
import { TenantDocService } from "../service/tenantDocService";
import { AuthService } from "../auth/authService";
import { AuthResolver } from "../auth/resolver";
import { createIdentityProvider } from "../auth/identityProviders";
import { createVerifier } from "../auth/tokenVerifier";
import { registerStorageProviders } from "../dao/bootstrap";

registerStorageProviders();

const documents = new MysqlDocumentRepository();
const folders = new MysqlFolderRepository();
const tenants = new MysqlTenantRepository();
const permissions = new MysqlPermissionRepository();
const audit = new MysqlAuditLogger();
const analytics = new MysqlAnalyticsRepository();
const resolver = new StorageResolver();

const directory = new MysqlDirectoryRepository();
const claimer = new MysqlLegacyActivityClaimer();
const tokenVerifier = createVerifier();
const identityProvider = createIdentityProvider();

export const container = {
  resolver,
  documentService: new DocumentService(documents, folders, tenants, permissions, audit, resolver),
  folderService: new FolderService(folders, audit),
  tenantService: new TenantService(tenants, resolver, analytics),
  permissionService: new PermissionService(documents, permissions),
  directory,
  /** Login/signup need configuration (User Service or preview mode); member and API-key management always work. */
  authService: new AuthService(directory, identityProvider, tokenVerifier, claimer),
  authResolver: new AuthResolver(tokenVerifier, directory),
  tenantDocService: new TenantDocService(tenants, new MysqlTenantDocRepository()),
};
