# Certificates

`digitalocean-ca.crt` is the certificate authority of the project's
Postgres at DigitalOcean (its "Project CA", valid to 2036). It is public:
it lets a client check that it really reached our database, nothing more.
DigitalOcean signs its servers with it, so no machine trusts them on its
own; `DATABASE_URL` points at this file:

    …/chassidushub?sslmode=verify-full&sslrootcert=certs/digitalocean-ca.crt

The path is from the repository root, where the Cloudflare build and the
GitHub jobs run. If the database moves or DigitalOcean renews the CA,
download the new one (Databases → the cluster → Connection details →
Download CA certificate) and replace this file.
