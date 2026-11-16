// Political map drawn on the GPU from two small lookup textures:
//   owners:  one pixel per grid cell (RG = country id, B = land), row 0 = north
//   palette: pixel N = color of country N
// The quad is shown in Web Mercator; each fragment converts its position
// back to latitude/longitude and reads the matching cell.
shader_type canvas_item;

uniform sampler2D owners : filter_nearest, repeat_disable;
uniform sampler2D palette : filter_nearest, repeat_disable;
uniform vec4 water_color : source_color = vec4(0.055, 0.094, 0.149, 1.0);
uniform vec4 unclaimed_color : source_color = vec4(0.35, 0.35, 0.33, 1.0);
uniform vec4 border_color : source_color = vec4(0.04, 0.04, 0.05, 1.0);
uniform vec4 coast_color : source_color = vec4(0.62, 0.72, 0.80, 1.0);
// Highest latitude shown, in degrees (Web Mercator stops at about 85.05).
uniform float max_lat = 85.0511;
uniform int hovered_id = -1;


// Cell coordinates (fractional) for a quad UV.
vec2 cell_coords(vec2 uv, vec2 size) {
	float merc_max = log(tan(PI * 0.25 + radians(max_lat) * 0.5));
	float merc = merc_max * (1.0 - 2.0 * uv.y);
	float lat = degrees(atan(sinh(merc)));
	// Image row 0 is latitude +90.
	return vec2(uv.x * size.x, (90.0 - lat) / 180.0 * size.y);
}

ivec3 cell(vec2 coords, vec2 size) {
	ivec2 p = ivec2(floor(coords));
	ivec2 isize = ivec2(size);
	p.x = (p.x % isize.x + isize.x) % isize.x; // longitude wraps
	p.y = clamp(p.y, 0, isize.y - 1);
	vec4 texel = texelFetch(owners, p, 0);
	int id = int(round(texel.r * 255.0)) + int(round(texel.g * 255.0)) * 256;
	return ivec3(id, texel.b > 0.5 ? 1 : 0, 0);
}

void fragment() {
	vec2 size = vec2(textureSize(owners, 0));
	vec2 here = cell_coords(UV, size);
	ivec3 c = cell(here, size);
	// Neighbouring screen pixels: a border is drawn wherever the owner changes
	// between this pixel and the next, so lines stay one pixel wide at any zoom.
	ivec3 cx = cell(here + dFdx(here), size);
	ivec3 cy = cell(here + dFdy(here), size);

	vec4 color;
	if (c.y == 0) {
		color = water_color;
	} else if (c.x == 0) {
		color = unclaimed_color;
	} else {
		color = texelFetch(palette, ivec2(c.x, 0), 0);
		if (c.x == hovered_id) {
			color.rgb = mix(color.rgb, vec3(1.0), 0.25);
		}
	}
	if (c.y != cx.y || c.y != cy.y) {
		color = coast_color;
	} else if (c.y == 1 && (c.x != cx.x || c.x != cy.x)) {
		color = border_color;
	}
	COLOR = color;
}
