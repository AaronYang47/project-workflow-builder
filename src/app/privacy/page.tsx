import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Falcon Process Building System",
  description: "Privacy policy for Falcon Process Building System",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0b111b] px-6 py-12 text-slate-100 sm:px-10">
      <article className="mx-auto max-w-3xl space-y-8 leading-7">
        <header className="space-y-3 border-b border-slate-700 pb-7">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
            Falcon Process Building System
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-slate-400">Effective October 27, 2026</p>
        </header>

        <p>
          This policy explains how Aaron Yang handles information in Falcon Process Building
          System, including its website and Microsoft Store app. The app helps users build
          project workflows, manage release conditions, save project records, and export them.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Information we handle</h2>
          <p>
            If you create an account, we receive your name, email address, and password. We
            store a password hash and salt rather than the plain text password. We also handle
            sign-in session data, workflows and project records you save, and files you choose
            to upload. Project content may include customer or other personal information that
            you enter. The app also stores some workflow and file information locally in your
            browser. Hosting providers may process technical information such as IP address and
            request logs when you use the service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">How we use information</h2>
          <p>
            We use this information to sign you in, save and retrieve your work, support file
            uploads and exports, provide customer search features, maintain the service, and
            respond to support requests. Customer searches may also query the Falcon customer
            management service at customer-management-system.pages.dev.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Storage and sharing</h2>
          <p>
            The service runs on Cloudflare infrastructure, including database and file storage
            services. We share information with service providers only as needed to operate the
            app or when required by law. If you use a collaboration link, your workflow content
            and collaborator display information can be shared with other people who join that
            room through a peer-to-peer connection. Connection services may process technical
            connection information needed to establish that connection. We do not sell personal
            information. A session cookie is used for sign-in; local browser storage keeps some
            app data and preferences on your device.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Your choices and retention</h2>
          <p>
            You can delete cloud projects and uploaded files using the app’s available controls.
            You can permanently delete your account from Account settings after confirming your
            password. This also deletes your cloud projects, project history, uploaded files,
            and sign-in sessions. You can clear other local app data through your browser or
            device settings. For access, correction, or help with account deletion, email us
            at the address below. We
            keep information while it is needed to provide the service and may retain it longer
            where required for security, legal, or operational reasons.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Children</h2>
          <p>This business workflow app is not designed for children.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Changes and contact</h2>
          <p>
            We may update this policy as the service changes. The effective date above will be
            updated when we do. For privacy questions or requests, contact Aaron Yang at{" "}
            <a className="text-sky-400 underline" href="mailto:aaronyang470128@hotmail.com">
              aaronyang470128@hotmail.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
