"""vizcore - the arithmetic behind the stage checks, free of Blender so that it can be tested anywhere.
Every function takes plain numbers / numpy arrays and returns plain numbers."""
import math
import numpy as np


def sun_position(lat, lon, utc):
    """Elevation and azimuth of the sun in degrees (azimuth clockwise from north) for a place and a UTC datetime.
    NOAA's short formulas; good to a few tenths of a degree, which is far inside any render tolerance."""
    doy = utc.timetuple().tm_yday
    hours = utc.hour + utc.minute / 60.0 + utc.second / 3600.0
    g = 2 * math.pi / 365.0 * (doy - 1 + (hours - 12) / 24.0)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    tst = hours * 60 + eqtime + 4 * lon  # true solar time, minutes
    ha = math.radians(tst / 4.0 - 180.0)
    la = math.radians(lat)
    cos_zen = math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)
    zen = math.acos(max(-1.0, min(1.0, cos_zen)))
    az = math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(la) - math.tan(decl) * math.cos(la))) + 180.0
    return 90.0 - math.degrees(zen), az % 360.0


def sun_from_matrix(m3):
    """Where a Blender sun lamp says the sun is. A sun lamp shines along its local -Z, so the sun
    stands in the direction of the lamp's +Z axis. World: +Z up, +Y north, +X east."""
    x, y, z = float(m3[0][2]), float(m3[1][2]), float(m3[2][2])
    n = math.sqrt(x * x + y * y + z * z) or 1.0
    return math.degrees(math.asin(max(-1.0, min(1.0, z / n)))), math.degrees(math.atan2(x, y)) % 360.0


def angle_diff(a, b):
    return abs((a - b + 180.0) % 360.0 - 180.0)


def step_stats(deltas):
    """Vertical differences along a seam (metres; nan = no surface found on the other side)."""
    d = np.asarray(deltas, dtype=float)
    hit = d[~np.isnan(d)]
    out = {"samples": int(d.size), "gaps": int(np.isnan(d).sum())}
    if hit.size:
        a = np.abs(hit)
        out.update(max=round(float(a.max()), 4), p95=round(float(np.percentile(a, 95)), 4), mean=round(float(a.mean()), 4))
    else:
        out.update(max=None, p95=None, mean=None)
    return out


def orbit_stats(positions, target):
    """How regular a ring of camera positions is around a target point."""
    p = np.asarray(positions, dtype=float)
    t = np.asarray(target, dtype=float)
    v = p[:, :2] - t[:2]
    r = np.hypot(v[:, 0], v[:, 1])
    ang = np.degrees(np.arctan2(v[:, 1], v[:, 0]))
    steps = np.abs((np.diff(np.concatenate([ang, ang[:1]])) + 180.0) % 360.0 - 180.0)
    ideal = 360.0 / len(p)
    return {"count": int(len(p)), "radius": round(float(r.mean()), 3),
            "radius_spread_pct": round(float((r.max() - r.min()) / r.mean() * 100.0), 3) if r.mean() else None,
            "height_spread": round(float(p[:, 2].max() - p[:, 2].min()), 4),
            "step_deg": round(ideal, 4), "step_error_deg": round(float(np.abs(steps - ideal).max()), 4)}


def tile_size(len3d, lenuv):
    """Median real-world length of one UV unit (metres): how large a texture tile is on the model."""
    a = np.asarray(len3d, dtype=float)
    b = np.asarray(lenuv, dtype=float)
    ok = (b > 1e-9) & (a > 1e-9)
    return round(float(np.median(a[ok] / b[ok])), 4) if ok.any() else None


def in_frame_fraction(ndc):
    """Share of points whose camera-space coordinates fall inside the frame and in front of the camera."""
    n = np.asarray(ndc, dtype=float)
    if not len(n):
        return 0.0
    inside = (n[:, 0] >= 0) & (n[:, 0] <= 1) & (n[:, 1] >= 0) & (n[:, 1] <= 1) & (n[:, 2] > 0)
    return round(float(inside.mean()), 4)


def bbox_delta(actual_min, actual_max, expected_min, expected_max):
    """Largest difference between two boxes, in the units given."""
    return round(float(max(np.abs(np.asarray(actual_min, float) - np.asarray(expected_min, float)).max(),
                           np.abs(np.asarray(actual_max, float) - np.asarray(expected_max, float)).max())), 4)


def geometry_key(coords):
    """A cheap, order-independent fingerprint of a point cloud: count, rounded bounds and coordinate sums."""
    c = np.asarray(coords, dtype=float).reshape(-1, 3)
    if not len(c):
        return "0"
    return "%d|%s|%s|%s" % (len(c), np.round(c.min(axis=0), 3).tolist(), np.round(c.max(axis=0), 3).tolist(), np.round(c.sum(axis=0), 2).tolist())


def compare(value, op, limit):
    """value <op> limit for the operators a brief may use."""
    if value is None:
        return None
    return {"<=": value <= limit, "<": value < limit, ">=": value >= limit, ">": value > limit, "==": value == limit}[op]
