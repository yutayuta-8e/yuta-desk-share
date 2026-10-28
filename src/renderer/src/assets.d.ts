// Vite turns `?url` imports into the asset's served address
declare module '*?url' {
  const src: string
  export default src
}
