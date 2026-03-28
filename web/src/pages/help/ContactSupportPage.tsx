import React, { useState } from "react";
import {
  Send,
  Mail,
  Github,
  BookOpen,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import API_URL from "../../config";

export default function ContactSupportPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [category, setCategory] = useState("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const categories = [
    { value: "bug", label: t("help.categoryBug", "Bug Report") },
    { value: "question", label: t("help.categoryQuestion", "Question") },
    { value: "feature", label: t("help.categoryFeature", "Feature Request") },
    { value: "other", label: t("help.categoryOther", "Other") },
  ];

  const systemInfo = [
    { label: t("help.systemInfoPlatform", "Platform"), value: "VANTAGE" },
    { label: t("help.systemInfoUser", "User"), value: user?.username || "—" },
    { label: t("help.systemInfoRole", "Role"), value: (user?.role || "—").toUpperCase() },
    {
      label: t("help.systemInfoBrowser", "Browser"),
      value: navigator.userAgent.includes("Chrome")
        ? "Chrome"
        : navigator.userAgent.includes("Firefox")
          ? "Firefox"
          : navigator.userAgent.includes("Safari")
            ? "Safari"
            : t("help.other", "Other"),
    },
    { label: t("help.systemInfoLanguage", "Language"), value: navigator.language },
    { label: t("help.systemInfoMfa", "MFA"), value: user?.mfa_enabled ? t("help.enabled", "Enabled") : t("help.disabled", "Disabled") },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setSending(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, description }),
      });

      if (!res.ok) throw new Error("Failed to send");

      setSent(true);
      setSubject("");
      setDescription("");
    } catch {
      setError(t("help.sendError", "Could not send the message. Please try again or use the email channel below."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="page-with-side-rail">
        <div className="page-main-pane">
          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">{t("help.sendMessage", "Send a Message")}</h3>
            </div>
            <div className="p-6">
              {sent ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="p-4 bg-emerald-500/10 rounded-full">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-on-surface">
                    {t("help.messageSent", "Message Sent")}
                  </h3>
                  <p className="text-sm text-on-surface-variant text-center max-w-md">
                    {t("help.messageSentBody", "Your support request has been submitted. Our team will review it and respond via email. You can also check the status in your notifications.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSent(false)}
                    className="btn btn-outline mt-4"
                  >
                    {t("help.sendAnotherMessage", "Send Another Message")}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="flex items-center gap-2 rounded-sm bg-error/10 px-4 py-3 text-sm text-error">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t("help.category", "Category")}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      aria-label={t("help.category", "Category")}
                      title={t("help.category", "Category")}
                      className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t("help.subject", "Subject")}
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder={t("help.subjectPlaceholder", "Brief description of your issue")}
                      required
                      className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-sm text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t("help.description", "Description")}
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("help.descriptionPlaceholder", "Provide as much detail as possible: what happened, what you expected, steps to reproduce...")}
                      required
                      rows={6}
                      className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-sm text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none resize-y"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={sending || !subject.trim() || !description.trim()}
                      className="btn btn-primary"
                    >
                      <Send className="w-4 h-4" />
                      {sending ? t("help.sending", "Sending...") : t("help.sendButton", "Send Message")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="page-side-rail">
          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">{t("help.systemInformation", "System Information")}</h3>
            </div>
            <div className="p-4 space-y-3">
              {systemInfo.map((item) => (
                <div key={item.label} className="flex justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {item.label}
                  </span>
                  <span className="text-xs font-medium text-on-surface">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {t("help.responseTime", "Response Time")}
            </h4>
            <p className="text-sm text-on-surface-variant">
              {t("help.responseTimeBody", "We typically respond within 24 hours for bug reports and 48 hours for feature requests.")}
            </p>
          </div>
        </div>
      </div>

      <div className="surface-section">
        <div className="surface-section-header">
          <h3 className="surface-section-title">{t("help.otherChannels", "Other Channels")}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-surface-container">
          <a
            href="mailto:suporte@vantage.security"
            className="flex items-center gap-4 p-6 hover:bg-surface-container-low transition-colors"
          >
            <div className="p-3 bg-primary/10 rounded-sm">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-on-surface">{t("help.emailLabel", "Email")}</h4>
              <p className="text-xs text-on-surface-variant">
                suporte@vantage.security
              </p>
            </div>
          </a>

          <a
            href="https://github.com/iteam-soc/vantage/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-6 hover:bg-surface-container-low transition-colors"
          >
            <div className="p-3 bg-on-surface/5 rounded-sm">
              <Github className="w-5 h-5 text-on-surface" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-on-surface">
                {t("help.githubIssues", "GitHub Issues")}
              </h4>
              <p className="text-xs text-on-surface-variant">
                {t("help.reportBugs", "Report bugs and request features")}
              </p>
            </div>
          </a>

          <a
            href="/help/docs"
            className="flex items-center gap-4 p-6 hover:bg-surface-container-low transition-colors"
          >
            <div className="p-3 bg-primary/10 rounded-sm">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-on-surface">
                {t("help.documentationLink", "Documentation")}
              </h4>
              <p className="text-xs text-on-surface-variant">
                {t("help.browseGuides", "Browse guides and tutorials")}
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
