import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";

/**
 * Authenticated services dashboard (T-405). Lists the org's service requests
 * newest-first with their derived status and links to the public notice page
 * and the generated certificate PDF.
 *
 * NOTE: the issue spec was written against a hypothetical `Service`/`Notice`
 * data model (with a `clerkUserId` column and `lib/prisma.ts`). This repo's
 * schema instead has a single `ServiceRequest` that IS the notice (1:1 with its
 * `NoticeAccess` and `CertificatePdf`), scoped to an `Organization`. The query,
 * relations and column mapping below are adapted to that real schema so the
 * page compiles and typechecks while preserving the spec's intent.
 */
export default async function DashboardPage() {
  // userId/orgId come from the verified Clerk session token, never the client.
  const { userId, orgId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Services are scoped to the caller's active organization — the schema relates
  // each ServiceRequest to an Organization, not directly to a Clerk user id.
  const services = await prisma.serviceRequest.findMany({
    where: { organization: { clerkOrgId: orgId ?? "" } },
    include: {
      access: true,
      certificatePdf: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Your services</h1>

      {services.length === 0 ? (
        <p className="text-gray-500">No services yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="px-3 py-2 font-semibold">Service Name</th>
                <th className="px-3 py-2 font-semibold">Case Ref</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Notice</th>
                <th className="px-3 py-2 font-semibold">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                // Derived status: a generated certificate implies the notice was
                // accessed and certified; otherwise a first-access record means it
                // was opened; otherwise it is still pending.
                const status = service.certificatePdf
                  ? "Certified"
                  : service.access
                    ? "Accessed"
                    : "Pending";

                return (
                  <tr key={service.id} className="border-b border-gray-200">
                    <td className="px-3 py-2">{service.caseCaption}</td>
                    <td className="px-3 py-2">{service.noticeToken ?? "—"}</td>
                    <td className="px-3 py-2">{status}</td>
                    <td className="px-3 py-2">
                      {service.noticeToken ? (
                        <Link
                          href={`/n/${service.noticeToken}`}
                          className="text-blue-600 underline"
                        >
                          View
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {service.certificatePdf ? (
                        <a
                          href={`/api/certificate/${service.id}`}
                          className="text-blue-600 underline"
                        >
                          Download
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
