const fromValues = require('../vec2/fromValues')

/**
 * Multiply the input matrix by a Vector2 (interpreted as 2 row, 1 column)
 * (result = M*v)
 * Fourth element is set to 1
 * @param {vec2} vector the input vector
 * @param {mat4} matrix the input matrix
 * @returns {vec2} output
 */
const rightMultiplyVec2 = (vector, matrix) => {
  const [v0, v1] = vector
  const v2 = 0
  const v3 = 1
  let x = v0 * matrix[0] + v1 * matrix[1] + v2 * matrix[2] + v3 * matrix[3]
  let y = v0 * matrix[4] + v1 * matrix[5] + v2 * matrix[6] + v3 * matrix[7]
  const w = v0 * matrix[12] + v1 * matrix[13] + v2 * matrix[14] + v3 * matrix[15]

  // scale such that fourth element becomes 1:
  if (w !== 1) {
    const invw = 1.0 / w
    x *= invw
    y *= invw
  }
  return fromValues(x, y)
}

module.exports = rightMultiplyVec2
