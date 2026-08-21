# Authentication deployment troubleshooting

## Why `POST /api/auth/login` returned 405

`/api/auth/login` is a DMS server-side proxy endpoint. A `405 Method Not
Allowed` response with an `nginx/1.24.0` body means the request was rejected by
the Nginx/frontend host before it reached the DMS Express application. It is
not a bad email or password and it is not a User Service authentication error.

The UI now calls the public User Service login and signup endpoints directly:

```text
POST https://apidev.sifymodernization.digital/user-mgt/api/user/login
POST https://apidev.sifymodernization.digital/user-mgt/api/user/
```

Both requests include `x-app-id: DMS`. Therefore the login request should no
longer appear as `POST https://dev.sifymodernization.digital/api/auth/login`.

## Required deployment configuration

1. Rebuild and redeploy the web application after setting the `NEXT_PUBLIC_*`
   variables. Next.js embeds these values at build time.
2. Set:

   ```env
   NEXT_PUBLIC_USER_MGT_BASE_URL=https://apidev.sifymodernization.digital/user-mgt
   NEXT_PUBLIC_DMS_API_BASE_URL=https://apidev.sifymodernization.digital/dms
   NEXT_PUBLIC_DMS_APP_ID=DMS
   NEXT_PUBLIC_AUTH_MODE=keycloak
   ```

3. On the DMS backend deployment, configure the browser origin and public API
   prefix before restarting the Express service:

   ```env
   DMS_WEB_ORIGIN=https://dev.sifymodernization.digital
   CORS_ALLOWED_ORIGINS=https://dev.sifymodernization.digital
   PUBLIC_API_PATH=/dms/api
   ```

4. Configure User Service CORS for the deployed DMS origin, for example
   `https://dev.sifymodernization.digital`, including:
   - methods `POST`, `GET`, and `OPTIONS`;
   - request headers `Content-Type` and `x-app-id`.
5. DMS tenant, document, People and role-assignment calls still go to the DMS
   API. Do not use the User Service URL for `NEXT_PUBLIC_DMS_API_BASE_URL`.
6. If the browser should refresh directly at Keycloak, set a browser-reachable
   `NEXT_PUBLIC_KEYCLOAK_TOKEN_URL` and configure Keycloak CORS. If it is left
   empty, the UI uses the DMS refresh proxy.

## Nginx configuration for the deployed `/dms/api` path

For the URL shown in the browser (`https://apidev.sifymodernization.digital/dms/api/...`),
Nginx must forward all methods, OPTIONS preflights and request bodies to the DMS
Express server. Adapt the upstream address to the actual DMS API deployment:

```nginx
location /dms/api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass_request_body on;
    proxy_pass_request_headers on;
}
```

After changing Nginx, reload it and verify `POST /dms/api/auth/refresh` and
`GET /dms/api/tenants/mine` separately. Public login/signup should still be
verified against the `apidev.sifymodernization.digital` URLs above.

## Why the User Service login can still return 401

A `401` from:

```text
POST https://apidev.sifymodernization.digital/user-mgt/api/user/login
```

means the request reached the User Service, but the User Service rejected the
login. Verify all of the following in the User Service:

- the user exists and is active;
- the password is correct and the account is not locked;
- the application is registered with exactly `appId: DMS`;
- the browser request includes `x-app-id: DMS`;
- the login response is not being replaced by an upstream gateway error.

This 401 is separate from the DMS CORS error. Do not remove `x-app-id` to work
around CORS; DMS requires it for every authenticated API request.
