const test = require('ava')

const { color, geometry, primitives } = require('@jscad/modeling')

const serializer = require('../index.js')

test('serialize 3D geometry to amf', function (t) {
  const emptyShape = geometry.geom3.create()
  const observed1 = serializer.serialize({}, emptyShape)
  t.deepEqual(observed1, expected1)

  const testCube = primitives.cube()
  const observed2 = serializer.serialize({}, testCube)
  t.deepEqual(observed2, expected2)

  const coloredCube = color.color([1.0, 0.0, 0.5, 0.8], testCube)
  const observed3 = serializer.serialize({ unit: 'inch' }, coloredCube)
  t.deepEqual(observed3, expected3)
})

const expected1 = [
  `<?xml version="1.0" encoding="UTF-8"?>
<amf unit="millimeter" version="1.1">
  <metadata type="author">Created using JSCAD</metadata>
</amf>
`
]

const expected2 = [
  `<?xml version="1.0" encoding="UTF-8"?>
<amf unit="millimeter" version="1.1">
  <metadata type="author">Created using JSCAD</metadata>
  <object id="0">
    <mesh>
      <vertices>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
      </vertices>
      <volume>
        <triangle>
          <v1>0</v1>
          <v2>1</v2>
          <v3>2</v3>
        </triangle>
        <triangle>
          <v1>0</v1>
          <v2>2</v2>
          <v3>3</v3>
        </triangle>
      </volume>
      <volume>
        <triangle>
          <v1>4</v1>
          <v2>5</v2>
          <v3>6</v3>
        </triangle>
        <triangle>
          <v1>4</v1>
          <v2>6</v2>
          <v3>7</v3>
        </triangle>
      </volume>
      <volume>
        <triangle>
          <v1>8</v1>
          <v2>9</v2>
          <v3>10</v3>
        </triangle>
        <triangle>
          <v1>8</v1>
          <v2>10</v2>
          <v3>11</v3>
        </triangle>
      </volume>
      <volume>
        <triangle>
          <v1>12</v1>
          <v2>13</v2>
          <v3>14</v3>
        </triangle>
        <triangle>
          <v1>12</v1>
          <v2>14</v2>
          <v3>15</v3>
        </triangle>
      </volume>
      <volume>
        <triangle>
          <v1>16</v1>
          <v2>17</v2>
          <v3>18</v3>
        </triangle>
        <triangle>
          <v1>16</v1>
          <v2>18</v2>
          <v3>19</v3>
        </triangle>
      </volume>
      <volume>
        <triangle>
          <v1>20</v1>
          <v2>21</v2>
          <v3>22</v3>
        </triangle>
        <triangle>
          <v1>20</v1>
          <v2>22</v2>
          <v3>23</v3>
        </triangle>
      </volume>
    </mesh>
  </object>
</amf>
`
]

const expected3 = [
  `<?xml version="1.0" encoding="UTF-8"?>
<amf unit="inch" version="1.1">
  <metadata type="author">Created using JSCAD</metadata>
  <object id="0">
    <mesh>
      <vertices>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>-1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>-1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
        <vertex>
          <coordinates>
            <x>-1</x>
            <y>1</y>
            <z>1</z>
          </coordinates>
        </vertex>
      </vertices>
      <volume>
        <color>
          <r>1</r>
          <g>0</g>
          <b>0.5</b>
          <a>0.8</a>
        </color>
        <triangle>
          <v1>0</v1>
          <v2>1</v2>
          <v3>2</v3>
        </triangle>
        <triangle>
          <v1>0</v1>
          <v2>2</v2>
          <v3>3</v3>
        </triangle>
      </volume>
      <volume>
        <color>
          <r>1</r>
          <g>0</g>
          <b>0.5</b>
          <a>0.8</a>
        </color>
        <triangle>
          <v1>4</v1>
          <v2>5</v2>
          <v3>6</v3>
        </triangle>
        <triangle>
          <v1>4</v1>
          <v2>6</v2>
          <v3>7</v3>
        </triangle>
      </volume>
      <volume>
        <color>
          <r>1</r>
          <g>0</g>
          <b>0.5</b>
          <a>0.8</a>
        </color>
        <triangle>
          <v1>8</v1>
          <v2>9</v2>
          <v3>10</v3>
        </triangle>
        <triangle>
          <v1>8</v1>
          <v2>10</v2>
          <v3>11</v3>
        </triangle>
      </volume>
      <volume>
        <color>
          <r>1</r>
          <g>0</g>
          <b>0.5</b>
          <a>0.8</a>
        </color>
        <triangle>
          <v1>12</v1>
          <v2>13</v2>
          <v3>14</v3>
        </triangle>
        <triangle>
          <v1>12</v1>
          <v2>14</v2>
          <v3>15</v3>
        </triangle>
      </volume>
      <volume>
        <color>
          <r>1</r>
          <g>0</g>
          <b>0.5</b>
          <a>0.8</a>
        </color>
        <triangle>
          <v1>16</v1>
          <v2>17</v2>
          <v3>18</v3>
        </triangle>
        <triangle>
          <v1>16</v1>
          <v2>18</v2>
          <v3>19</v3>
        </triangle>
      </volume>
      <volume>
        <color>
          <r>1</r>
          <g>0</g>
          <b>0.5</b>
          <a>0.8</a>
        </color>
        <triangle>
          <v1>20</v1>
          <v2>21</v2>
          <v3>22</v3>
        </triangle>
        <triangle>
          <v1>20</v1>
          <v2>22</v2>
          <v3>23</v3>
        </triangle>
      </volume>
    </mesh>
  </object>
</amf>
`
]
