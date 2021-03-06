const geom2ToGeometries = (solid, options) => {
  const defaults = {
    color: [1, 0.4, 0, 1] // default color
  }
  let {color} = Object.assign({}, defaults, options)

  if ('color' in solid) color = solid.color

  let positions = []
  solid.sides.forEach((side) => {
    positions.push([side[0][0], side[0][1], 0])
    positions.push([side[1][0], side[1][1], 0])
  })
  let normals = positions.map(x => [0, 0, -1])
  let indices = positions.map((x, i) => i) // FIXME: temporary, not really needed, need to change drawMesh

  return [ { positions, normals, color, indices } ]
}

module.exports = geom2ToGeometries
