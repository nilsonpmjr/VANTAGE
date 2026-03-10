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


def is_smtp_configured() -> bool:
    """Check if SMTP settings are configured."""
    return bool(settings.smtp_host)


async def _send_email(to_email: str, subject: str, text_body: str, html_body: str) -> bool:
    """Internal helper to send an email via SMTP."""
    if not settings.smtp_host:
        return False

    try:
        import aiosmtplib

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from
        msg["To"] = to_email

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
        return True

    except Exception as exc:
        logger.error(f"Failed to send email to {to_email}: {exc}")
        return False


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

    subject = "Redefinição de Senha — SOC Platform"
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

    result = await _send_email(to_email, subject, text_body, html_body)
    if result:
        logger.info(f"Password reset email sent to {to_email}")
    return result


async def send_batch_complete(to_email: str, job_id: str, total: int, threats: int, url: str = "") -> bool:
    """
    Send notification when a batch job completes.
    """
    if not settings.smtp_host:
        logger.warning(f"[SMTP not configured] Batch complete for {to_email}: job={job_id}")
        return False

    subject = f"Batch Analysis Complete — {total} targets"
    frontend_url = url or settings.frontend_url

    text_body = (
        f"Seu lote de análise foi concluído.\n\n"
        f"Job ID: {job_id}\n"
        f"Total de alvos: {total}\n"
        f"Ameaças detectadas: {threats}\n\n"
        f"Acesse a plataforma para ver os resultados: {frontend_url}"
    )
    html_body = f"""
    <div style="font-family:sans-serif;max-width:500px;">
      <h2 style="color:#38bdf8;margin-bottom:0.5rem;">Batch Analysis Complete</h2>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;">
        <tr>
          <td style="padding:0.5rem;border:1px solid #333;color:#aaa;">Total de alvos</td>
          <td style="padding:0.5rem;border:1px solid #333;font-weight:700;">{total}</td>
        </tr>
        <tr>
          <td style="padding:0.5rem;border:1px solid #333;color:#aaa;">Ameaças detectadas</td>
          <td style="padding:0.5rem;border:1px solid #333;font-weight:700;color:{'#ef4444' if threats > 0 else '#10b981'};">{threats}</td>
        </tr>
      </table>
      <p style="color:#888;font-size:0.85rem;">Job ID: {job_id}</p>
      <p>
        <a href="{frontend_url}" style="display:inline-block;background:#38bdf8;color:#0a0f1a;
           padding:0.5rem 1.2rem;border-radius:6px;text-decoration:none;font-weight:600;">
          Ver Resultados
        </a>
      </p>
    </div>
    """

    result = await _send_email(to_email, subject, text_body, html_body)
    if result:
        logger.info(f"Batch complete email sent to {to_email} (job={job_id})")
    return result


async def send_watchlist_alert(to_email: str, changed_items: list) -> bool:
    """
    Send notification when watchlist items change verdict.

    changed_items: list of dicts with keys: target, old_verdict, new_verdict
    """
    if not settings.smtp_host:
        logger.warning(f"[SMTP not configured] Watchlist alert for {to_email}: {len(changed_items)} changes")
        return False

    subject = f"Watchlist Alert — {len(changed_items)} target(s) changed"

    rows_text = "\n".join(
        f"  - {item['target']}: {item.get('old_verdict', '?')} → {item['new_verdict']}"
        for item in changed_items
    )
    text_body = (
        f"Mudanças detectadas na sua watchlist:\n\n{rows_text}\n\n"
        f"Acesse a plataforma para mais detalhes: {settings.frontend_url}"
    )

    rows_html = "".join(
        f"""<tr>
          <td style="padding:0.4rem 0.6rem;border:1px solid #333;color:#38bdf8;font-family:monospace;">{item['target']}</td>
          <td style="padding:0.4rem 0.6rem;border:1px solid #333;">{item.get('old_verdict', '—')}</td>
          <td style="padding:0.4rem 0.6rem;border:1px solid #333;font-weight:700;">{item['new_verdict']}</td>
        </tr>"""
        for item in changed_items
    )
    html_body = f"""
    <div style="font-family:sans-serif;max-width:600px;">
      <h2 style="color:#38bdf8;margin-bottom:0.5rem;">Watchlist Alert</h2>
      <p style="color:#aaa;">{len(changed_items)} alvo(s) mudaram de veredito:</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;">
        <thead>
          <tr style="background:#1e293b;">
            <th style="padding:0.4rem 0.6rem;border:1px solid #333;text-align:left;color:#aaa;">Alvo</th>
            <th style="padding:0.4rem 0.6rem;border:1px solid #333;text-align:left;color:#aaa;">Antes</th>
            <th style="padding:0.4rem 0.6rem;border:1px solid #333;text-align:left;color:#aaa;">Depois</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>
      <p>
        <a href="{settings.frontend_url}" style="display:inline-block;background:#38bdf8;color:#0a0f1a;
           padding:0.5rem 1.2rem;border-radius:6px;text-decoration:none;font-weight:600;">
          Ver Detalhes
        </a>
      </p>
    </div>
    """

    result = await _send_email(to_email, subject, text_body, html_body)
    if result:
        logger.info(f"Watchlist alert sent to {to_email} ({len(changed_items)} changes)")
    return result
