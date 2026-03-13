const baseUrl = process.env.APP_URL ?? "http://localhost:3000"

const users = [
  { name: "Workflow Admin", email: "admin@example.com", password: "password1234" },
  { name: "Workflow Manager", email: "manager@example.com", password: "password1234" },
  { name: "Primary Reviewer", email: "reviewer1@example.com", password: "password1234" },
  { name: "Secondary Reviewer", email: "reviewer2@example.com", password: "password1234" },
  { name: "Workflow Requester", email: "requester@example.com", password: "password1234" },
]

for (const user of users) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      referer: `${baseUrl}/sign-up`,
    },
    body: JSON.stringify(user),
  })

  if (response.ok) {
    console.log(`Seeded ${user.email}`)
    continue
  }

  const payload = await response.text()
  console.log(`Skipped ${user.email}: ${response.status} ${payload}`)
}
