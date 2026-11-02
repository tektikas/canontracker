export default defineEventHandler(async (event) =>
  memberChange(getRouterParam(event, 'userId')!, parseRole((await readObject<{ role?: string }>(event)).role)))
