export const resolveTarget = (pathname, config) => {
  const route = config.routes.find(({ prefix }) => {
    if (prefix.endsWith('/')) return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
  return route
    ? { type: 'local', target: route.target, prefix: route.prefix }
    : { type: 'fallback', target: config.fallback }
}
