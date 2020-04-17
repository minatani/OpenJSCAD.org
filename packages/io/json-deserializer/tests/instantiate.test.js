const test = require('ava')

const deserializer = require('../index.js')

const { geometry } = require('@jscad/modeling')

test('instantiate JSON notation to JSCAD geometries', (t) => {
  let observed = deserializer.deserialize({ output: 'geometry', addMetaData: false }, json1)
  t.is(observed.length, 1)

  observed = deserializer.deserialize({ filename: 'json2', output: 'geometry' }, json2)
  t.is(observed.length, 1)
  t.true(geometry.geom3.isA(observed[0]))

  observed = deserializer.deserialize({ filename: 'json3', output: 'geometry' }, json3)
  t.is(observed.length, 1)
  t.true(geometry.geom2.isA(observed[0]))

  observed = deserializer.deserialize({ filename: 'json4', output: 'geometry' }, json4)
  t.is(observed.length, 1)
  t.true(geometry.path2.isA(observed[0]))

  observed = deserializer.deserialize({ filename: 'json5', output: 'geometry' }, json5)
  t.is(observed.length, 2)
  t.true(geometry.geom2.isA(observed[0]))
  t.true(geometry.path2.isA(observed[1]))

  observed = deserializer.deserialize({ output: 'geometry', addMetaData: false }, json6)
  t.is(observed.length, 1)
})

// JSON notations for tests
const json1 = '{}'

const json2 = '[{"polygons":[{"vertices":[[-15,-15,-15],[-15,-15,15],[-15,15,15],[-15,15,-15]],"plane":[-1,0,0,15]},{"vertices":[[15,-15,-15],[15,15,-15],[15,15,15],[15,-15,15]],"plane":[1,0,0,15]},{"vertices":[[-15,-15,-15],[15,-15,-15],[15,-15,15],[-15,-15,15]],"plane":[0,-1,0,15]},{"vertices":[[-15,15,-15],[-15,15,15],[15,15,15],[15,15,-15]],"plane":[0,1,0,15]},{"vertices":[[-15,-15,-15],[-15,15,-15],[15,15,-15],[15,-15,-15]],"plane":[0,0,-1,15]},{"vertices":[[-15,-15,15],[15,-15,15],[15,15,15],[-15,15,15]],"plane":[0,0,1,15]}],"isRetesselated":false,"transforms":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}]'

const json3 = '[{"sides":[[[4.6193976402282715,-2.678784132003784],[5,0]],[[5,0],[4.6193976402282715,2.678784132003784]],[[4.6193976402282715,2.678784132003784],[3.535533905029297,4.949747562408447]],[[3.535533905029297,4.949747562408447],[1.9134172201156616,6.467156887054443]],[[1.9134172201156616,6.467156887054443],[3.0616169991140216e-16,7]],[[3.0616169991140216e-16,7],[-1.9134172201156616,6.467156887054443]],[[-1.9134172201156616,6.467156887054443],[-3.535533905029297,4.949747562408447]],[[-3.535533905029297,4.949747562408447],[-4.6193976402282715,2.678784132003784]],[[-4.6193976402282715,2.678784132003784],[-5,8.572527703398379e-16]],[[-5,8.572527703398379e-16],[-4.6193976402282715,-2.678784132003784]],[[-4.6193976402282715,-2.678784132003784],[-3.535533905029297,-4.949747562408447]],[[-3.535533905029297,-4.949747562408447],[-1.9134172201156616,-6.467156887054443]],[[-1.9134172201156616,-6.467156887054443],[-9.184850467946473e-16,-7]],[[-9.184850467946473e-16,-7],[1.9134172201156616,-6.467156887054443]],[[1.9134172201156616,-6.467156887054443],[3.535533905029297,-4.949747562408447]],[[3.535533905029297,-4.949747562408447],[4.6193976402282715,-2.678784132003784]]],"transforms":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"color":[1,0,0,1],"name":"this is a name"}]'

const json4 = '[{"points":[[34.985713958740234,163.35238647460938],[49.39168167114258,179.00868225097656],[57.22199630737305,198.7909393310547],[57.43418502807617,220.06549072265625],[50,240]],"isClosed":false,"transforms":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"color":[1,0,0,1]}]'

const json5 = '[{"sides":[[[4.6193976402282715,-2.678784132003784],[5,0]],[[5,0],[4.6193976402282715,2.678784132003784]],[[4.6193976402282715,2.678784132003784],[3.535533905029297,4.949747562408447]],[[3.535533905029297,4.949747562408447],[1.9134172201156616,6.467156887054443]],[[1.9134172201156616,6.467156887054443],[3.0616169991140216e-16,7]],[[3.0616169991140216e-16,7],[-1.9134172201156616,6.467156887054443]],[[-1.9134172201156616,6.467156887054443],[-3.535533905029297,4.949747562408447]],[[-3.535533905029297,4.949747562408447],[-4.6193976402282715,2.678784132003784]],[[-4.6193976402282715,2.678784132003784],[-5,8.572527703398379e-16]],[[-5,8.572527703398379e-16],[-4.6193976402282715,-2.678784132003784]],[[-4.6193976402282715,-2.678784132003784],[-3.535533905029297,-4.949747562408447]],[[-3.535533905029297,-4.949747562408447],[-1.9134172201156616,-6.467156887054443]],[[-1.9134172201156616,-6.467156887054443],[-9.184850467946473e-16,-7]],[[-9.184850467946473e-16,-7],[1.9134172201156616,-6.467156887054443]],[[1.9134172201156616,-6.467156887054443],[3.535533905029297,-4.949747562408447]],[[3.535533905029297,-4.949747562408447],[4.6193976402282715,-2.678784132003784]]],"transforms":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"color":[1,0,0,1],"name":"this is a name"},{"points":[[34.985713958740234,163.35238647460938],[49.39168167114258,179.00868225097656],[57.22199630737305,198.7909393310547],[57.43418502807617,220.06549072265625],[50,240]],"isClosed":false,"transforms":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"color":[1,0,0,1]}]'

// non-JSCAD object
const json6 = '[{"statistics":[[34.985713958740234,163.35238647460938],[49.39168167114258,179.00868225097656],[57.22199630737305,198.7909393310547],[57.43418502807617,220.06549072265625],[50,240]],"average":123.456}]'
