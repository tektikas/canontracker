export default defineEventHandler(async (event) =>
  memberChange(getRouterParam(event, 'userId')!, parseRole((await readBody<{ role?: string }>(event)).role)))
