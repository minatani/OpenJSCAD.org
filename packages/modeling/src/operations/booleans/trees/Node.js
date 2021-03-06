const plane = require('../../../math/plane')

// # class Node
// Holds a node in a BSP tree. A BSP tree is built from a collection of polygons
// by picking a polygon to split along.
// Polygons are not stored directly in the tree, but in PolygonTreeNodes, stored in
// this.polygontreenodes. Those PolygonTreeNodes are children of the owning
// Tree.polygonTree
// This is not a leafy BSP tree since there is
// no distinction between internal and leaf nodes.
const Node = function (parent) {
  this.plane = null
  this.front = null
  this.back = null
  this.polygontreenodes = []
  this.parent = parent
}

Node.prototype = {
  // Convert solid space to empty space and empty space to solid space.
  invert: function () {
    let queue = [this]
    let node
    for (let i = 0; i < queue.length; i++) {
      node = queue[i]
      if (node.plane) node.plane = plane.flip(node.plane)
      if (node.front) queue.push(node.front)
      if (node.back) queue.push(node.back)
      let temp = node.front
      node.front = node.back
      node.back = temp
    }
  },

  // clip polygontreenodes to our plane
  // calls remove() for all clipped PolygonTreeNodes
  clipPolygons: function (polygontreenodes, alsoRemovecoplanarFront) {
    let current = { 'node': this, 'polygontreenodes': polygontreenodes }
    let node
    let stack = []

    do {
      node = current.node
      polygontreenodes = current.polygontreenodes

      // begin "function"
      if (node.plane) {
        let backnodes = []
        let frontnodes = []
        let coplanarfrontnodes = alsoRemovecoplanarFront ? backnodes : frontnodes
        let plane = node.plane
        let numpolygontreenodes = polygontreenodes.length
        for (let i = 0; i < numpolygontreenodes; i++) {
          let node1 = polygontreenodes[i]
          if (!node1.isRemoved()) {
            node1.splitByPlane(plane, coplanarfrontnodes, backnodes, frontnodes, backnodes)
          }
        }

        if (node.front && (frontnodes.length > 0)) {
          stack.push({ 'node': node.front, 'polygontreenodes': frontnodes })
        }
        let numbacknodes = backnodes.length
        if (node.back && (numbacknodes > 0)) {
          stack.push({ 'node': node.back, 'polygontreenodes': backnodes })
        } else {
          // there's nothing behind this plane. Delete the nodes behind this plane:
          for (let i = 0; i < numbacknodes; i++) {
            backnodes[i].remove()
          }
        }
      }
      current = stack.pop()
    } while (current !== undefined)
  },

  // Remove all polygons in this BSP tree that are inside the other BSP tree
  // `tree`.
  clipTo: function (tree, alsoRemovecoplanarFront) {
    let node = this
    let stack = []
    do {
      if (node.polygontreenodes.length > 0) {
        tree.rootnode.clipPolygons(node.polygontreenodes, alsoRemovecoplanarFront)
      }
      if (node.front) stack.push(node.front)
      if (node.back) stack.push(node.back)
      node = stack.pop()
    } while (node !== undefined)
  },

  addPolygonTreeNodes: function (newpolygontreenodes) {
    let current = { 'node': this, 'polygontreenodes': newpolygontreenodes }
    let stack = []
    do {
      let node = current.node
      let polygontreenodes = current.polygontreenodes

      if (polygontreenodes.length === 0) {
        current = stack.pop()
        continue
      }
      if (!node.plane) {
        let index = 0 // default
        index = Math.floor(polygontreenodes.length / 2)
        //index = polygontreenodes.length >> 1
        //index = Math.floor(Math.random()*polygontreenodes.length)
        let bestplane = polygontreenodes[index].getPolygon().plane
        node.plane = bestplane
      }
      let frontnodes = []
      let backnodes = []

      for (let i = 0, n = polygontreenodes.length; i < n; ++i) {
        polygontreenodes[i].splitByPlane(node.plane, node.polygontreenodes, backnodes, frontnodes, backnodes)
      }

      if (frontnodes.length > 0) {
        if (!node.front) node.front = new Node(node)
        stack.push({ 'node': node.front, 'polygontreenodes': frontnodes })
      }
      if (backnodes.length > 0) {
        if (!node.back) node.back = new Node(node)
        stack.push({ 'node': node.back, 'polygontreenodes': backnodes })
      }

      current = stack.pop()
    } while (current !== undefined)
  },

  // TODO is this still used?
  getParentPlaneNormals: function (normals, maxdepth) {
    if (maxdepth > 0) {
      if (this.parent) {
        normals.push(this.parent.plane.normal)
        this.parent.getParentPlaneNormals(normals, maxdepth - 1)
      }
    }
  }
}

module.exports = Node
