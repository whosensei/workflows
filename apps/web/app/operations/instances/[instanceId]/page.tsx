import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { WorkflowInstanceDetailScreen } from "@/components/workflow-instance-detail-screen"
import { auth } from "@/lib/auth"

export default async function WorkflowInstanceDetailPage({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/sign-in")
  }

  const { instanceId } = await params

  return (
    <main className="min-h-svh px-6 py-10 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <WorkflowInstanceDetailScreen instanceId={instanceId} />
      </div>
    </main>
  )
}
