const { toArray } = require('./arrays')

const intersection = (...solids) => {
  solids = toArray(solids)
  return { children: solids, type: 'intersection', params: undefined }
}

module.exports = intersection
