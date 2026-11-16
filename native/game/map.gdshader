// Political map drawn on the GPU from small lookup textures:
//   owners:  one pixel per grid cell (RG = country id, B = land), row 0 = north
//   regions: one pixel per grid cell (RG = region number, 0 = none)
//   palette: pixel N = color of country N
// The quad is shown in Web Mercator; each fragment converts its position
// back to latitude/longitude and reads the matching cell.
shader_type canvas_item;

uniform sampler2D owners : filter_nearest, repeat_disable;
uniform sampler2D regions : filter_nearest, repeat_disable;
uniform sampler2D palette : filter_nearest, repeat_disable;
uniform bool has_regions = false;
uniform vec4 water_color : source_color = vec4(0.055, 0.094, 0.149, 1.0);
uniform vec4 unclaimed_color : source_color = vec4(0.35, 0.35, 0.33, 1.0);
uniform vec4 border_color : source_color = vec4(0.04, 0.04, 0.05, 1.0);
uniform vec4 coast_color : source_color = vec4(0.62, 0.72, 0.80, 1.0);
// Highest latitude shown, in degrees (Web Mercator stops at about 85.05).
uniform float max_lat = 85.0511;
uniform int hovered_id = -1;
uniform int hovered_region = -1;

// Cell coordinates (fractional) for a quad UV.
vec2 cell_coords(vec2 uv, vec2 size) {
	float merc_max = log(tan(PI * 0.25 + radians(max_lat) * 0.5));
	float merc = merc_max * (1.0 - 2.0 * uv.y);
	float lat = degrees(atan(sinh(merc)));
	// Image row 0 is latitude +90.
	return vec2(uv.x * size.x, (90.0 - lat) / 180.0 * size.y);
}

ivec2 cell_pixel(vec2 coords, ivec2 size) {
	ivec2 p = ivec2(floor(coords));
	p.x = (p.x % size.x + size.x) % size.x; // longitude wraps
	p.y = clamp(p.y, 0, size.y - 1);
	return p;
}

int id_from(vec4 texel) {
	return int(round(texel.r * 255.0)) + int(round(texel.g * 255.0)) * 256;
}

// x = controlling country, y = 1 on land, z = region number.
ivec3 cell(vec2 coords, ivec2 size) {
	ivec2 p = cell_pixel(coords, size);
	vec4 texel = texelFetch(owners, p, 0);
	int region = has_regions ? id_from(texelFetch(regions, p, 0)) : 0;
	return ivec3(id_from(texel), texel.b > 0.5 ? 1 : 0, region);
}

void fragment() {
	ivec2 size = textureSize(owners, 0);
	vec2 here = cell_coords(UV, vec2(size));
	ivec3 c = cell(here, size);
	// Neighbouring screen pixels: a border is drawn wherever something changes
	// between this pixel and the next, so lines stay one pixel wide at any zoom.
	ivec3 cx = cell(here + dFdx(here), size);
	ivec3 cy = cell(here + dFdy(here), size);
	// Region borders fade in once a cell is larger than about two pixels.
	float cells_per_pixel = max(length(dFdx(here)), length(dFdy(here)));
	float region_lines = 1.0 - smoothstep(0.35, 0.9, cells_per_pixel);

	vec4 color;
	if (c.y == 0) {
		color = water_color;
	} else if (c.x == 0) {
		color = unclaimed_color;
	} else {
		color = texelFetch(palette, ivec2(c.x, 0), 0);
		bool hovered = has_regions ? (c.z > 0 && c.z == hovered_region) : (c.x == hovered_id);
		if (hovered) {
			color.rgb = mix(color.rgb, vec3(1.0), 0.22);
		}
	}
	if (c.y != cx.y || c.y != cy.y) {
		color = coast_color;
	} else if (c.y == 1 && (c.x != cx.x || c.x != cy.x)) {
		color = border_color;
	} else if (c.y == 1 && region_lines > 0.0 && (c.z != cx.z || c.z != cy.z)) {
		color.rgb = mix(color.rgb, border_color.rgb, 0.3 * region_lines);
	}
	COLOR = color;
}
