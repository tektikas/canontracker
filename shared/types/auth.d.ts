// nuxt-auth-utils session shape. Only ids live in the cookie; names and roles are read from the database.
declare module '#auth-utils' {
  interface User {
    id: string
  }
  interface UserSession {
    projectId?: string | null
    loggedInAt?: string
  }
}

export {}
