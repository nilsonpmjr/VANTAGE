Multi-Factor Authentication (MFA)
===================================

VANTAGE supports TOTP-based MFA compatible with any RFC 6238 authenticator app
(Google Authenticator, Authy, 1Password, etc.).

TOTP secrets are stored AES-256 encrypted at rest.

Setup (user)
------------

1. Navigate to **Profile → Security**.
2. Click **Enable MFA**.
3. Scan the QR code with your authenticator app.
4. Enter the 6-digit code to confirm.
5. Save the **backup codes** displayed — they are shown only once.

Policy enforcement (admin)
--------------------------

Admins can require MFA for specific roles under **Admin → Security Policies**:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Policy
     - Description
   * - ``MFA_REQUIRED_FOR_ADMIN``
     - Require MFA for all users with role ``admin``
   * - ``MFA_REQUIRED_FOR_ALL``
     - Require MFA for all users regardless of role

When MFA is required and a user has not enrolled, they are redirected to the MFA setup
page immediately after login.

Backup codes
------------

Each user receives 10 single-use backup codes at MFA enrollment. These can be used in
place of a TOTP code if the device is unavailable. Backup codes are regenerated under
**Profile → Security → Regenerate backup codes** (invalidates all existing codes).
