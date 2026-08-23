import { DocumentService } from "../service/documentService";
import { FolderService } from "../service/folderService";
import { PermissionService } from "../service/permissionService";
import { RoleResolver } from "../service/roleResolver";
import { StorageResolver } from "../service/storageResolver";
import { TenantService } from "../service/tenantService";
import { MysqlAnalyticsRepository } from "../dao/mysql/MysqlAnalyticsRepository";
import { MysqlAuditLogger } from "../dao/mysql/MysqlAuditLogger";
import { MysqlDocumentRepository } from "../dao/mysql/MysqlDocumentRepository";
import { MysqlFolderRepository } from "../dao/mysql/MysqlFolderRepository";
import { MysqlPermissionRepository } from "../dao/mysql/MysqlPermissionRepository";
import { MysqlTenantRepository } from "../dao/mysql/MysqlTenantRepository";
import { MysqlTenantMembershipRepository } from "../dao/mysql/MysqlTenantMembershipRepository";
import { MysqlUserAppRoleRepository } from "../dao/mysql/MysqlUserAppRoleRepository";
import { createUserManagementClient } from "../clients/userManagementClient";
import { registerStorageProviders } from "../dao/bootstrap";

registerStorageProviders();

const documents = new MysqlDocumentRepository();
const folders = new MysqlFolderRepository();
const tenants = new MysqlTenantRepository();
const tenantMemberships = new MysqlTenantMembershipRepository();
const userAppRoles = new MysqlUserAppRoleRepository();
const userManagementClient = createUserManagementClient();
const permissions = new MysqlPermissionRepository();
const audit = new MysqlAuditLogger();
const analytics = new MysqlAnalyticsRepository();
const resolver = new StorageResolver();
const roleResolver = new RoleResolver(userManagementClient, tenantMemberships, userAppRoles);

export const container = {
  resolver,
  roleResolver,
  documentService: new DocumentService(documents, folders, tenants, permissions, audit, resolver),
  folderService: new FolderService(folders, audit),
  tenantService: new TenantService(tenants, resolver, analytics, tenantMemberships),
  tenantRepository: tenants,
  tenantMemberships,
  userAppRoles,
  userManagementClient,
  permissionService: new PermissionService(documents, permissions),
};
