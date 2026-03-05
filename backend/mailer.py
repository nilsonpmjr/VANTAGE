"""
Async email utility for the SOC platform.

If SMTP is not configured (smtp_host is empty), emails are NOT sent and the
function returns False. In development mode the reset link is logged so
developers can test without a real mail server.
"""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings
from logging_config import get_logger

logger = get_logger("Mailer")


async def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """
    Send a password-reset email.

    Returns True if the email was dispatched successfully.
    Returns False if SMTP is not configured (graceful degradation).
    """
    reset_link = f"{settings.frontend_url}?token={reset_token}"

    if not settings.smtp_host:
        # Dev mode: log the link so manual testing is possible without SMTP
        logger.warning(
            f"[SMTP not configured] Password reset link for {to_email}: {reset_link}"
        )
        return False

    try:
        import aiosmtplib  # imported here to avoid hard dependency at startup

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Redefinição de Senha — SOC Platform"
        msg["From"] = settings.smtp_from
        msg["To"] = to_email

        text_body = (
            "Você solicitou a redefinição da sua senha.\n\n"
            f"Clique no link abaixo (válido por 15 minutos):\n{reset_link}\n\n"
            "Se você não solicitou esta redefinição, ignore este e-mail."
        )
        html_body = f"""
        <p>Você solicitou a redefinição da sua senha na plataforma SOC.</p>
        <p>
          <a href="{reset_link}"
             style="display:inline-block;background:#38bdf8;color:#0a0f1a;
                    padding:0.6rem 1.4rem;border-radius:6px;text-decoration:none;
                    font-weight:600;font-family:sans-serif;">
            Redefinir Senha
          </a>
        </p>
        <p style="color:#888;font-size:0.85rem;">
          Este link é válido por 15 minutos e só pode ser usado uma vez.<br>
          Se você não solicitou esta redefinição, ignore este e-mail.
        </p>
        """

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_pass or None,
            use_tls=settings.smtp_tls,
        )
        logger.info(f"Password reset email sent to {to_email}")
        return True

    except Exception as exc:
        logger.error(f"Failed to send reset email to {to_email}: {exc}")
        return False
