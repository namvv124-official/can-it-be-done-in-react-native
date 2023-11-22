import React from "react";
import type { ReactNode } from "react";
import { Fill, Shader, vec } from "@shopify/react-native-skia";
import { Dimensions } from "react-native";

import { frag } from "../components";

// From https://hewgill.com/picomath/javascript/erf.js.html
const erf = (x: number) => {
  // constants
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // Save the sign of x
  let sign = 1;
  if (x < 0) {
    sign = -1;
  }
  x = Math.abs(x);

  // A&S formula 7.1.26
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
};

const update = (radius: number, sigma: number) => {
  const linear = true;
  const correction = false;

  // if (sigma === 0.0) {
  //   return;
  // }

  const weights = [];
  let sumWeights = 0.0;
  for (let i = -radius; i <= radius; i++) {
    let w = 0;
    if (correction) {
      w =
        (erf((i + 0.5) / sigma / Math.sqrt(2)) -
          erf((i - 0.5) / sigma / Math.sqrt(2))) /
        2;
    } else {
      w = Math.exp((-i * i) / sigma / sigma);
    }
    sumWeights += w;
    weights.push(w);
  }

  for (const i in weights) {
    weights[i] /= sumWeights;
  }

  const offsets = [];
  let newWeights = [];

  let hasZeros = false;

  if (linear) {
    for (let i = -radius; i <= radius; i += 2) {
      if (i === radius) {
        offsets.push(i);
        newWeights.push(weights[i + radius]);
      } else {
        const w0 = weights[i + radius + 0];
        const w1 = weights[i + radius + 1];

        const w = w0 + w1;
        if (w > 0) {
          offsets.push(i + w1 / w);
        } else {
          hasZeros = true;
          offsets.push(i);
        }
        newWeights.push(w);
      }
    }
  } else {
    for (let i = -radius; i <= radius; i++) {
      offsets.push(i);
    }

    for (const w of weights) {
      if (w === 0.0) {
        hasZeros = true;
      }
    }

    newWeights = weights;
  }

  if (hasZeros) {
    console.warn(
      "Some weights are equal to zero; try using a smaller radius or a bigger sigma"
    );
  }

  const N = newWeights.length;

  return {
    N,
    offsets,
    weights: newWeights,
  };
};

const val = 16;
const v1 = update(val, 1);
const v2 = update(val, 20);
const v3 = update(val, 40);
const v4 = update(val, 60);

const { N } = v1;
const WEIGHTS1 = v1.weights;
const OFFSETS1 = v1.offsets;
const WEIGHTS2 = v2.weights;
const OFFSETS2 = v2.offsets;
const WEIGHTS3 = v3.weights;
const OFFSETS3 = v3.offsets;
const WEIGHTS4 = v4.weights;
const OFFSETS4 = v4.offsets;

const source = frag`
uniform shader image;
uniform shader mask;

uniform float2 resolution;
uniform float2 direction;

uniform float[${N}] WEIGHTS1;
uniform float[${N}] OFFSETS1;
uniform float[${N}] WEIGHTS2;
uniform float[${N}] OFFSETS2;
uniform float[${N}] WEIGHTS3;
uniform float[${N}] OFFSETS3;
uniform float[${N}] WEIGHTS4;
uniform float[${N}] OFFSETS4;

vec2 interpolate(float amount, vec2 val1, vec2 val2, vec2 val3, vec2 val4) {
  vec2 result;
  if (amount < 0.33) {
      result = mix(val1, val2, amount / 0.33);
  } else if (amount < 0.66) {
      result = mix(val2, val3, (amount - 0.33) / 0.33);
  } else {
      result = mix(val3, val4, (amount - 0.66) / 0.34);
  }
  return result;
}

float interpolate(float amount, float val1, float val2, float val3, float val4) {
  float result;
  if (amount < 0.33) {
      result = mix(val1, val2, amount / 0.33);
  } else if (amount < 0.66) {
      result = mix(val2, val3, (amount - 0.33) / 0.33);
  } else {
      result = mix(val3, val4, (amount - 0.66) / 0.34);
  }
  return result;
}

// blurDirection is:
//     vec2(1,0) for horizontal pass
//     vec2(0,1) for vertical pass
// The sourceTexture to be blurred MUST use linear filtering!
// pixelCoord is in [0..1]
vec4 blur(vec2 blurDirection, vec2 pixelCoord, float amount)
{
    vec4 result = vec4(0.0);
    for (int i = 0; i < ${N}; ++i)
    {
        vec2 offset = blurDirection * interpolate(amount, OFFSETS1[i], OFFSETS2[i], OFFSETS3[i], OFFSETS4[i]);
        float weight = interpolate(amount, WEIGHTS1[i], WEIGHTS2[i], WEIGHTS3[i], WEIGHTS4[i]);
        result += image.eval((pixelCoord + offset)) * weight;
    }
    return result;
}

half4 main(vec2 fragCoord) {
  float amount = mask.eval(fragCoord).a;
  if (amount == 0.0) {
    return image.eval(fragCoord);
  }
  return blur(direction, fragCoord.xy, amount);
}
`;

interface BlurGradientProps {
  mask: ReactNode | ReactNode[];
  children: ReactNode | ReactNode[];
}

const { width, height } = Dimensions.get("window");

export const BlurGradient = ({ mask, children }: BlurGradientProps) => {
  return (
    <Fill>
      <Shader
        source={source}
        uniforms={{
          resolution: vec(width, height),
          direction: vec(1, 0),
          WEIGHTS1,
          OFFSETS1,
          WEIGHTS2,
          OFFSETS2,
          WEIGHTS3,
          OFFSETS3,
          WEIGHTS4,
          OFFSETS4,
        }}
      >
        <Shader
          source={source}
          uniforms={{
            resolution: vec(width, height),
            direction: vec(0, 1),
            WEIGHTS1,
            OFFSETS1,
            WEIGHTS2,
            OFFSETS2,
            WEIGHTS3,
            OFFSETS3,
            WEIGHTS4,
            OFFSETS4,
          }}
        >
          {children}
          {mask}
        </Shader>
        {mask}
      </Shader>
    </Fill>
  );
};
