import {
  DEFAULT_GPS_REVIEW_DISTANCE_METERS,
  formatDistanceMeters,
  haversineMeters,
  locationEvidence,
} from './geo.js';

describe('geo helpers', () => {
  it('uses a 250 metre default review threshold', () => {
    expect(DEFAULT_GPS_REVIEW_DISTANCE_METERS).toBe(250);
  });

  it('computes Haversine distance between nearby Chicago points', () => {
    const meters = haversineMeters(
      { latitude: 41.882, longitude: -87.637 },
      { latitude: 41.8828, longitude: -87.637 },
    );
    expect(meters).toBeGreaterThan(80);
    expect(meters).toBeLessThan(100);
  });

  it('classifies near-site, review, missing GPS, missing site, and poor accuracy', () => {
    const site = { siteLatitude: 41.882, siteLongitude: -87.637 };
    expect(
      locationEvidence({
        latitude: 41.8827,
        longitude: -87.637,
        accuracyMeters: 18,
        ...site,
      }).locationStatus,
    ).toBe('NEAR_SITE');

    const review = locationEvidence({
      latitude: 41.8945,
      longitude: -87.637,
      accuracyMeters: 23,
      ...site,
    });
    expect(review.locationStatus).toBe('LOCATION_REVIEW');
    expect(review.distanceFromSiteMeters).toBeGreaterThan(1000);
    expect(formatDistanceMeters(review.distanceFromSiteMeters)).toMatch(/km/);

    expect(
      locationEvidence({
        latitude: 41.882,
        longitude: -87.637,
        accuracyMeters: 400,
        ...site,
      }).locationStatus,
    ).toBe('LOW_ACCURACY');

    expect(locationEvidence({}).locationStatus).toBe('NO_GPS');
    expect(
      locationEvidence({ latitude: 41.882, longitude: -87.637 }).locationStatus,
    ).toBe('NO_SITE_LOCATION');
  });

  it('builds an Open-in-Maps URL without a Maps API key', () => {
    const evidence = locationEvidence({
      latitude: 41.882,
      longitude: -87.637,
    });
    expect(evidence.mapsUrl).toBe('https://maps.google.com/?q=41.882,-87.637');
  });
});
