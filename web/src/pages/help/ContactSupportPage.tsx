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
import API_URL from "../../config";

const CATEGORIES = [
  { value: "bug", label: "Bug Report" },
  { value: "question", label: "Question" },
  { value: "feature", label: "Feature Request" },
  { value: "other", label: "Other" },
];

export default function ContactSupportPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const systemInfo = [
    { label: "Platform", value: "VANTAGE" },
    { label: "User", value: user?.username || "—" },
    { label: "Role", value: (user?.role || "—").toUpperCase() },
    {
      label: "Browser",
      value: navigator.userAgent.includes("Chrome")
        ? "Chrome"
        : navigator.userAgent.includes("Firefox")
          ? "Firefox"
          : navigator.userAgent.includes("Safari")
            ? "Safari"
            : "Other",
    },
    { label: "Language", value: navigator.language },
    { label: "MFA", value: user?.mfa_enabled ? "Enabled" : "Disabled" },
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
      setError(
        "Could not send the message. Please try again or use the email channel below.",
      );
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
              <h3 className="surface-section-title">Send a Message</h3>
            </div>
            <div className="p-6">
              {sent ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="p-4 bg-emerald-500/10 rounded-full">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-on-surface">
                    Message Sent
                  </h3>
                  <p className="text-sm text-on-surface-variant text-center max-w-md">
                    Your support request has been submitted. Our team will review
                    it and respond via email. You can also check the status in
                    your notifications.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSent(false)}
                    className="btn btn-outline mt-4"
                  >
                    Send Another Message
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
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      aria-label="Category"
                      title="Category"
                      className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief description of your issue"
                      required
                      className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-sm text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide as much detail as possible: what happened, what you expected, steps to reproduce..."
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
                      {sending ? "Sending..." : "Send Message"}
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
              <h3 className="surface-section-title">System Information</h3>
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
              Response Time
            </h4>
            <p className="text-sm text-on-surface-variant">
              We typically respond within <strong className="text-on-surface">24 hours</strong> for
              bug reports and <strong className="text-on-surface">48 hours</strong> for feature requests.
            </p>
          </div>
        </div>
      </div>

      <div className="surface-section">
        <div className="surface-section-header">
          <h3 className="surface-section-title">Other Channels</h3>
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
              <h4 className="text-sm font-bold text-on-surface">Email</h4>
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
                GitHub Issues
              </h4>
              <p className="text-xs text-on-surface-variant">
                Report bugs and request features
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
                Documentation
              </h4>
              <p className="text-xs text-on-surface-variant">
                Browse guides and tutorials
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
