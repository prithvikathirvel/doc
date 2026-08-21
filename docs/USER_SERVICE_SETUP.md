# DMS User Service setup checklist

Use the exact uppercase application id `DMS`. The role names intentionally do
not have a `DMS` prefix because `appId` scopes the roles.

## 1. Register the application

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/app-auth-config
Content-Type: application/json
```

```json
{
  "appId": "DMS",
  "appName": "Document Management System",
  "appUrl": "http://localhost:3000",
  "provider": "keycloak",
  "clientId": "dms-web",
  "clientSecret": "<server-only-secret>",
  "config": {
    "baseUrl": "http://1.6.37.35/keycloak",
    "realm": "dms",
    "adminUsername": "admin",
    "adminPassword": "admin"
  },
  "isActive": true
}
```

Replace `appUrl`, redirect URIs and web origins with the real DMS origins in
staging and production. Because the browser calls the public login/signup URLs,
allow the DMS origin in User Service CORS with `POST`, `OPTIONS`,
`Content-Type` and `x-app-id`. Enable the client's service account/client-
credentials grant and grant it permission to read users/roles and assign app
roles. Never commit the secret.

## 2. Create the feature catalog

Send each request separately. Include `x-app-id: DMS` and the server-side
service-account bearer token.

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/feature/
x-app-id: DMS
Authorization: Bearer <service-account-token>
Content-Type: application/json
```

### Documents

```json
{
  "appId": "DMS",
  "feature": "Documents",
  "actions": [
    { "key": "DOCUMENT_READ", "value": "View and download documents" },
    { "key": "DOCUMENT_WRITE", "value": "Upload, rename and add versions" },
    { "key": "DOCUMENT_DELETE", "value": "Move to trash and restore" },
    { "key": "DOCUMENT_ADMIN", "value": "Share and manage permissions" }
  ]
}
```

### Tenants

```json
{
  "appId": "DMS",
  "feature": "Tenants",
  "actions": [
    { "key": "TENANT_CREATE", "value": "Onboard tenants" },
    { "key": "TENANT_READ", "value": "View tenants" },
    { "key": "TENANT_UPDATE", "value": "Edit tenant settings and storage" }
  ]
}
```

### Users

```json
{
  "appId": "DMS",
  "feature": "Users",
  "actions": [
    { "key": "USER_READ", "value": "View workspace users" },
    { "key": "USER_ROLE", "value": "Assign workspace roles" }
  ]
}
```

## 3. Create the roles

Use `POST /api/role/` for each payload. Save each returned `roleId`; DMS needs the IDs when assigning a user. Ensure
Keycloak includes the assigned application role name in the access token's
`realm_access.roles` or `resource_access.dms-web.roles` claim. The DMS verifier
accepts the unprefixed names `Platform Admin`, `Tenant Admin` and `Member` and
maps them to its stable internal role IDs.

### Tenant Admin

```json
{
  "roleName": "Tenant Admin",
  "appId": "DMS",
  "description": "Full control over one tenant's documents, users and settings",
  "permission": {
    "appId": "DMS",
    "privilege": [
      {
        "feature": "Documents",
        "actions": ["DOCUMENT_READ", "DOCUMENT_WRITE", "DOCUMENT_DELETE", "DOCUMENT_ADMIN"]
      },
      { "feature": "Users", "actions": ["USER_READ", "USER_ROLE"] }
    ]
  },
  "template": "High Privileges"
}
```

### Platform Admin

```json
{
  "roleName": "Platform Admin",
  "appId": "DMS",
  "description": "Onboard tenants and administer every DMS workspace",
  "permission": {
    "appId": "DMS",
    "privilege": [
      {
        "feature": "Documents",
        "actions": ["DOCUMENT_READ", "DOCUMENT_WRITE", "DOCUMENT_DELETE", "DOCUMENT_ADMIN"]
      },
      {
        "feature": "Tenants",
        "actions": ["TENANT_CREATE", "TENANT_READ", "TENANT_UPDATE"]
      },
      { "feature": "Users", "actions": ["USER_READ", "USER_ROLE"] }
    ]
  },
  "template": "High Privileges"
}
```

### Member

```json
{
  "roleName": "Member",
  "appId": "DMS",
  "description": "Read documents granted by DMS document permissions",
  "permission": {
    "appId": "DMS",
    "privilege": [
      { "feature": "Documents", "actions": ["DOCUMENT_READ"] }
    ]
  },
  "template": "Low Privileges"
}
```

## 4. Assign a role to a user

DMS performs this server-to-server after it has found the user and created the
DMS `tenant_members` row:

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/user-app-roles
x-app-id: DMS
Authorization: Bearer <service-account-token>
Content-Type: application/json
```

```json
{
  "appId": "DMS",
  "userId": "c3417cf5-5ca2-4736-bdf6-9b37a2fa0e63",
  "roleId": "<role-id-from-the-role-create-response>"
}
```

To change a role:

```http
PUT https://apidev.sifymodernization.digital/user-mgt/api/user-app-roles/c3417cf5-5ca2-4736-bdf6-9b37a2fa0e63/DMS
x-app-id: DMS
Authorization: Bearer <service-account-token>
Content-Type: application/json
```

```json
{ "roleId": "<new-role-id>" }
```

## 5. Create a user for testing

```http
POST https://apidev.sifymodernization.digital/user-mgt/api/user/
x-app-id: DMS
Content-Type: application/json
```

```json
{
  "email": "priya@acme.com",
  "password": "Use-a-real-password-here",
  "username": "priya",
  "firstName": "Priya",
  "lastName": "Sharma",
  "phone": "+919876543210",
  "gender": "Female",
  "address": "No 1. ABC Street",
  "additionalDetails": { "department": "engineering" }
}
```

Then assign the appropriate role ID to the returned user ID and add the same
user ID to DMS `tenant_members` for each tenant the user may open. For a manual
first-user setup, the DMS row looks like this (prefer the DMS People screen in
normal operation):

```sql
INSERT INTO tenant_members
  (id, tenant_id, user_id, email, role, status, created_at, updated_at)
VALUES
  (UUID(), '<tenant-id-from-dms>', '<user-id-from-user-service>', 'priya@acme.com', 'member', 'active', NOW(), NOW());
```

The central role gives the coarse DMS role; DMS membership and
`document_permissions` still control tenant and file-level access.
