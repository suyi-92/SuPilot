/** Display only: never use this string to build SSH commands. */
export function endpoint(host: { username: string; address: string; port: number }) {
  const address = host.address.includes(':') ? `[${host.address}]` : host.address
  return `${host.username}@${address}:${host.port}`
}
