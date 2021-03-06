const vec2 = require('../../math/vec2')

const appendPoints = require('./appendPoints')
const toPoints = require('./toPoints')

/**
 * Append a Bezier curve to the end of the given geometry, using the control points to transition the curve through start and end points.
 * <br>
 * The Bézier curve starts at the last point in the path,
 * and ends at the last given control point. Other control points are intermediate control points.
 * <br>
 * The first control point may be null to ensure a smooth transition occurs. In this case,
 * the second to last control point of the path is mirrored into the control points of the Bezier curve.
 * In other words, the trailing gradient of the path matches the new gradient of the curve.
 * @param {Object} options - options for construction
 * @param {vec2[]} options.controlPoints - list of control points for the bezier curve
 * @param {Number} [options.segment=16] - number of segments per 360 rotation
 * @param {path2} geometry - the path of which to append the curves
 * @returns {path2} a new geometry with the appended curves
 *
 * @example
 * let p5 = path2.create({}, [[10,-20]])
 * p5 = path2.appendBezier({controlPoints: [[10,-10],[25,-10],[25,-20]]}, p5);
 * p5 = path2.appendBezier({controlPoints: [null, [25,-30],[40,-30],[40,-20]]}, p5)
 */
const appendBezier = (options, geometry) => {
  const defaults = {
    segments: 16
  }
  let { controlPoints, segments } = Object.assign({}, defaults, options)

  // validate the given options
  if (!Array.isArray(controlPoints)) throw new Error('controlPoints must be an array of one or more points')
  if (controlPoints.length < 1) throw new Error('controlPoints must be an array of one or more points')

  if (segments < 4) throw new Error('segments must be four or more')

  // validate the given geometry
  if (geometry.isClosed) {
    throw new Error('the given geometry cannot be closed')
  }

  let points = toPoints(geometry)
  if (points.length < 1) {
    throw new Error('the given path must contain one or more points (as the starting point for the bezier curve)')
  }

  // make a copy of the control points
  controlPoints = controlPoints.slice()

  // special handling of null control point (only first is allowed)
  let firstControlPoint = controlPoints[0]
  if (firstControlPoint === null) {
    if (controlPoints.length < 2) {
      throw new Error('a null control point must be passed with one more control points')
    }
    // special handling of a previous bezier curve
    let lastBezierControlPoint = points[points.length - 2]
    if ('lastBezierControlPoint' in geometry) {
      lastBezierControlPoint = geometry.lastBezierControlPoint
    }
    if (!Array.isArray(lastBezierControlPoint)) {
      throw new Error('the given path must contain TWO or more points if given a null control point')
    }
    // replace the first control point with the mirror of the last bezier control point
    let controlpoint = points[points.length - 1]
    controlpoint = vec2.scale(2, controlpoint)
    controlpoint = vec2.subtract(controlpoint, lastBezierControlPoint)

    controlPoints[0] = controlpoint
  }

  // add a control point for the previous end point
  controlPoints.unshift(points[points.length - 1])

  let bezierOrder = controlPoints.length - 1
  let factorials = []
  let fact = 1
  for (let i = 0; i <= bezierOrder; ++i) {
    if (i > 0) fact *= i
    factorials.push(fact)
  }

  let binomials = []
  for (let i = 0; i <= bezierOrder; ++i) {
    let binomial = factorials[bezierOrder] / (factorials[i] * factorials[bezierOrder - i])
    binomials.push(binomial)
  }

  const getPointForT = (t) => {
    let t_k = 1 // = pow(t,k)
    let one_minus_t_n_minus_k = Math.pow(1 - t, bezierOrder) // = pow( 1-t, bezierOrder - k)
    let inv_1_minus_t = (t !== 1) ? (1 / (1 - t)) : 1
    let point = vec2.create() // 0, 0, 0
    for (let k = 0; k <= bezierOrder; ++k) {
      if (k === bezierOrder) one_minus_t_n_minus_k = 1
      let bernsteinCoefficient = binomials[k] * t_k * one_minus_t_n_minus_k
      let derivativePoint = vec2.scale(bernsteinCoefficient, controlPoints[k])
      vec2.add(point, point, derivativePoint)
      t_k *= t
      one_minus_t_n_minus_k *= inv_1_minus_t
    }
    return point
  }

  let newpoints = []
  let newpointsT = []
  let numsteps = bezierOrder + 1
  for (let i = 0; i < numsteps; ++i) {
    let t = i / (numsteps - 1)
    let point = getPointForT(t)
    newpoints.push(point)
    newpointsT.push(t)
  }

  // subdivide each segment until the angle at each vertex becomes small enough:
  let subdivideBase = 1
  let maxangle = Math.PI * 2 / segments
  let maxsinangle = Math.sin(maxangle)
  while (subdivideBase < newpoints.length - 1) {
    let dir1 = vec2.normalize(vec2.subtract(newpoints[subdivideBase], newpoints[subdivideBase - 1]))
    let dir2 = vec2.normalize(vec2.subtract(newpoints[subdivideBase + 1], newpoints[subdivideBase]))
    let sinangle = vec2.cross(dir1, dir2) // the sine of the angle
    if (Math.abs(sinangle[2]) > maxsinangle) {
      // angle is too big, we need to subdivide
      let t0 = newpointsT[subdivideBase - 1]
      let t1 = newpointsT[subdivideBase + 1]
      let newt0 = t0 + (t1 - t0) * 1 / 3
      let newt1 = t0 + (t1 - t0) * 2 / 3
      let point0 = getPointForT(newt0)
      let point1 = getPointForT(newt1)
      // remove the point at subdivideBase and replace with 2 new points:
      newpoints.splice(subdivideBase, 1, point0, point1)
      newpointsT.splice(subdivideBase, 1, newt0, newt1)
      // re - evaluate the angles, starting at the previous junction since it has changed:
      subdivideBase--
      if (subdivideBase < 1) subdivideBase = 1
    } else {
      ++subdivideBase
    }
  }

  // append to the new points to the given path
  // but skip the first new point because it is identical to the last point in the given path
  newpoints.shift()
  let result = appendPoints(newpoints, geometry)
  result.lastBezierControlPoint = controlPoints[controlPoints.length - 2]
  return result
}

module.exports = appendBezier
