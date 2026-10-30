// Removes a member, or lets someone leave the studio themselves. Their past decisions stay in the audit log under their name.
export default defineEventHandler(event => memberChange(getRouterParam(event, 'userId')!, null))
