/**
 * emailService.js
 * Handles sending credentials and notifications via SMTP with development fallbacks
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

function reloadEnv() {
  const backendEnv = path.join(__dirname, '..', '.env');
  const rootEnv = path.join(__dirname, '..', '..', '.env');

  if (fs.existsSync(backendEnv)) {
    dotenv.config({ path: backendEnv, override: true });
  }
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv, override: true });
  }
}

class EmailService {
  constructor() {
    reloadEnv();
    this.host = process.env.SMTP_HOST || '';
    this.port = parseInt(process.env.SMTP_PORT) || 587;
    this.user = process.env.SMTP_USER || '';
    this.password = process.env.SMTP_PASSWORD || '';
    this.from = process.env.SMTP_FROM || '"GIET Smart Bus Tracking" <noreply@giet.edu>';
    this.appUrl = process.env.APP_URL || 'http://localhost:5000';
  }

  isBrevoConfigured() {
    reloadEnv();
    const key = (process.env.BREVO_API_KEY || '').trim();
    return !!key;
  }

  isSmtpConfigured() {
    reloadEnv();
    const host = (process.env.SMTP_HOST || this.host || '').trim();
    const user = (process.env.SMTP_USER || this.user || '').trim();
    const pass = (process.env.SMTP_PASSWORD || this.password || '').trim();
    return !!(host && user && pass);
  }

  isConfigured() {
    return this.isBrevoConfigured() || this.isSmtpConfigured();
  }

  getFromAddress() {
    reloadEnv();
    const rawFrom = process.env.SMTP_FROM || this.from;
    const user = (process.env.SMTP_USER || this.user || '').trim();
    const host = (process.env.SMTP_HOST || this.host || '').toLowerCase();
    if (host.includes('gmail.com') && rawFrom && rawFrom.includes('@giet.edu')) {
      return `"GIET Smart Bus System" <${user}>`;
    }
    return rawFrom || (user ? `"GIET Smart Bus System" <${user}>` : '"GIET Smart Bus Tracking" <noreply@giet.edu>');
  }

  createTransporter(customPort = null, customSecure = null) {
    reloadEnv();
    if (!this.isSmtpConfigured()) return null;
    const host = (process.env.SMTP_HOST || this.host).trim();
    const port = customPort !== null ? customPort : (parseInt(process.env.SMTP_PORT) || this.port);
    const isSecure = customSecure !== null ? customSecure : (process.env.SMTP_SECURE === 'true' || port === 465);
    const user = (process.env.SMTP_USER || this.user).trim();
    const pass = (process.env.SMTP_PASSWORD || this.password).replace(/\s+/g, '');

    return nodemailer.createTransport({
      pool: false,
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass
      },
      connectionTimeout: 9000,
      greetingTimeout: 9000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  getAppUrl(overrideAppUrl = null) {
    reloadEnv();
    const configuredUrl = (process.env.APP_URL || process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || '').trim();
    
    // 1. If a public production URL is configured, use it (ensures emails work from anywhere)
    if (configuredUrl && !configuredUrl.includes('localhost') && !configuredUrl.includes('127.0.0.1')) {
      return configuredUrl.replace(/\/+$/, '');
    }

    // 2. If the request was made from a public domain, use that domain
    if (overrideAppUrl && typeof overrideAppUrl === 'string' && overrideAppUrl.trim()) {
      const cleanOverride = overrideAppUrl.trim().replace(/\/+$/, '');
      if (!cleanOverride.includes('localhost') && !cleanOverride.includes('127.0.0.1')) {
        return cleanOverride;
      }
    }

    // 3. Fallback to official live Render website
    return configuredUrl ? configuredUrl.replace(/\/+$/, '') : 'https://giet-smart-bus-tracker.onrender.com';
  }

  getTransporter() {
    return this.createTransporter();
  }

  /**
   * Sends account credentials to a new @giet.edu user
   */
  async sendAccountCredentials({ to, userId, tempPassword, role, name, simulateConfigured = false, simulateUnconfigured = false, appUrl = null }) {
    if (simulateConfigured) {
      return { sent: true, reason: null, messageId: '<simulated-smtp@giet.edu>' };
    }
    if (simulateUnconfigured) {
      return {
        sent: false,
        reason: 'Email service is not configured in environment variables (BREVO_API_KEY or SMTP).'
      };
    }
    const baseAppUrl = this.getAppUrl(appUrl);
    const loginUrl = `${baseAppUrl}/pages/${role}/login.html`;
    const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);

    const emailSubject = 'GIET Smart Bus Tracking — Your Account';
    const emailBody = `
Dear ${name || 'User'},

Welcome to the GIET Smart University Bus Tracking System. An administrator has created your official account.

--------------------------------------------------
ACCOUNT CREDENTIALS
--------------------------------------------------
System User ID:      ${userId}
Registered Email:    ${to}
Assigned Role:       ${roleCapitalized}
Temporary Password:  ${tempPassword}
Login URL:           ${loginUrl}

--------------------------------------------------
IMPORTANT SECURITY INSTRUCTIONS:
--------------------------------------------------
1. This is a temporary password generated by the system.
2. You will be required to set a new, secure password immediately upon your first login.
3. Never share your credentials with anyone. GIET Transport administrators will never ask for your password.

If you have questions or suspect unauthorized access, contact the GIET Transport Office immediately.

Regards,
GIET University Transport Department
Gunupur, Odisha
    `.trim();

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;padding:24px;background:#ffffff;">
        <div style="text-align:center;padding-bottom:16px;border-bottom:2px solid #3b82f6;">
          <h2 style="color:#1e3a8a;margin:0;">🚌 GIET University</h2>
          <p style="color:#64748b;margin:4px 0 0;font-size:14px;">Smart Bus Tracking System</p>
        </div>
        <p style="color:#334155;margin-top:20px;">Dear <b>${name || 'User'}</b>,</p>
        <p style="color:#475569;line-height:1.5;">Your official account for the <b>GIET Smart Bus Tracking System</b> has been created by the transport administrator.</p>

        <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:16px;margin:20px 0;border-radius:4px;">
          <p style="margin:4px 0;color:#1e293b;"><b>System User ID:</b> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${userId}</code></p>
          <p style="margin:4px 0;color:#1e293b;"><b>Registered Email:</b> ${to}</p>
          <p style="margin:4px 0;color:#1e293b;"><b>Role:</b> ${roleCapitalized}</p>
          <p style="margin:4px 0;color:#1e293b;"><b>Temporary Password:</b> <code style="background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:4px;font-weight:bold;">${tempPassword}</code></p>
        </div>

        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="background:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Login to Your Dashboard</a>
        </div>

        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:20px;">
          <h4 style="color:#991b1b;margin:0 0 6px;">🔒 Security Notice:</h4>
          <p style="color:#7f1d1d;margin:0;font-size:13px;line-height:1.4;">
            This is a temporary password. You are <b>required to set a new password upon your first login</b>. Do not share your credentials with anyone.
          </p>
        </div>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px;" />
        <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0;">GIET University Transport Department • Gunupur, Odisha</p>
      </div>
    `;

    // ── 1. BREVO EMAIL API (Free 300/day, no custom domain required) ──
    if (this.isBrevoConfigured()) {
      try {
        const apiKey = (process.env.BREVO_API_KEY || '').trim();
        const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'surajmeher886@gmail.com').trim();
        const senderName = process.env.BREVO_SENDER_NAME || 'GIET Smart Bus System';

        console.log(`📨 Sending credentials via Brevo API to: ${to} (from: ${senderEmail})`);

        const brevoPayload = {
          sender: {
            name: senderName,
            email: senderEmail
          },
          to: [
            {
              email: to,
              name: name || 'User'
            }
          ],
          subject: emailSubject,
          htmlContent: htmlBody,
          textContent: emailBody
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          },
          body: JSON.stringify(brevoPayload)
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && (data.messageId || data.id)) {
          const msgId = data.messageId || data.id;
          console.log(`✅ Email sent successfully via Brevo API to ${to}! (Message ID: ${msgId})`);
          return { sent: true, reason: null, messageId: msgId };
        }

        const errMsg = data.message || `HTTP ${response.status} ${response.statusText}`;
        console.warn(`⚠️ Brevo API delivery failed: ${errMsg}`);

        if (!this.isSmtpConfigured()) {
          return {
            sent: false,
            reason: `Brevo API delivery failed: ${errMsg}`,
            devMode: process.env.NODE_ENV !== 'production',
            devCredentials: process.env.NODE_ENV !== 'production' ? {
              userId,
              system_user_id: userId,
              tempPassword,
              temporary_password: tempPassword,
              email: to,
              role
            } : null
          };
        }
        console.log('🔄 Falling back to SMTP fallback...');
      } catch (brevoErr) {
        console.warn(`⚠️ Brevo API exception: ${brevoErr.message}`);
        if (!this.isSmtpConfigured()) {
          return {
            sent: false,
            reason: `Brevo API delivery failed: ${brevoErr.message}`,
            devMode: process.env.NODE_ENV !== 'production',
            devCredentials: process.env.NODE_ENV !== 'production' ? {
              userId,
              system_user_id: userId,
              tempPassword,
              temporary_password: tempPassword,
              email: to,
              role
            } : null
          };
        }
      }
    }

    // ── 2. SMTP FALLBACK DELIVERY ──
    if (!this.isSmtpConfigured()) {
      const isProduction = process.env.NODE_ENV === 'production';
      return {
        sent: false,
        reason: 'Email service is not configured in environment variables (BREVO_API_KEY or SMTP).',
        devMode: !isProduction,
        devCredentials: isProduction ? undefined : {
          userId,
          system_user_id: userId,
          tempPassword,
          temporary_password: tempPassword,
          email: to,
          role
        }
      };
    }

    const mailOptions = {
      from: this.getFromAddress(),
      to,
      subject: emailSubject,
      text: emailBody,
      html: htmlBody
    };

    // BCC admin account so the administrator always receives an inbox copy to verify delivery
    const adminCopy = (process.env.SMTP_USER || this.user || '').trim();
    if (adminCopy && adminCopy.toLowerCase() !== to.toLowerCase()) {
      mailOptions.bcc = adminCopy;
    }

    const currentPort = parseInt(process.env.SMTP_PORT) || this.port;
    const currentSecure = process.env.SMTP_SECURE === 'true' || currentPort === 465;

    // 1. Primary Attempt
    try {
      const transporter = this.createTransporter(currentPort, currentSecure);
      await transporter.sendMail(mailOptions);
      return { sent: true, reason: null };
    } catch (primaryErr) {
      console.warn(`⚠️  Primary SMTP (port ${currentPort}) failed: ${primaryErr.message}. Attempting fallback port...`);

      // 2. Automatic Fallback Attempt (switch between 465 SSL and 587 STARTTLS)
      const altPort = currentPort === 465 ? 587 : 465;
      const altSecure = altPort === 465;

      try {
        const fallbackTransporter = this.createTransporter(altPort, altSecure);
        await fallbackTransporter.sendMail(mailOptions);
        console.log(`✅ SMTP fallback delivery succeeded on port ${altPort}!`);
        return { sent: true, reason: null };
      } catch (fallbackErr) {
        console.warn(`⚠️  Fallback SMTP (port ${altPort}) also failed: ${fallbackErr.message}`);
        return {
          sent: false,
          reason: `Email delivery failed: ${primaryErr.message}`,
          devMode: process.env.NODE_ENV !== 'production',
          devCredentials: process.env.NODE_ENV !== 'production' ? {
            userId,
            system_user_id: userId,
            tempPassword,
            temporary_password: tempPassword,
            email: to,
            role
          } : null
        };
      }
    }
  }
}

module.exports = new EmailService();
