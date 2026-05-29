import type { PostDto, TripDto } from '@stb/shared';

export interface TripGroup {
  tripId: string | undefined;
  tripName: string | undefined;
  posts: PostDto[];
}

export interface CountryGroup {
  country: string;
  trips: TripGroup[];
}

/**
 * Group posts into Country → Trip → Posts for the archive view. Countries are
 * sorted alphabetically; within a country, named trips sort alphabetically and
 * the "no trip" bucket (tripId undefined) comes last. Post order within a group
 * is preserved from the input (the API returns newest-first).
 */
export function groupPosts(posts: PostDto[], trips: TripDto[]): CountryGroup[] {
  const tripNames = new Map(trips.map((t) => [t.id, t.name]));
  const byCountry = new Map<string, Map<string | undefined, PostDto[]>>();

  for (const post of posts) {
    const countryTrips = byCountry.get(post.country) ?? new Map();
    byCountry.set(post.country, countryTrips);
    const list = countryTrips.get(post.tripId) ?? [];
    list.push(post);
    countryTrips.set(post.tripId, list);
  }

  return [...byCountry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, countryTrips]) => ({
      country,
      trips: [...countryTrips.entries()]
        .map(([tripId, groupPostsList]) => ({
          tripId,
          tripName: tripId ? tripNames.get(tripId) : undefined,
          posts: groupPostsList,
        }))
        .sort((a, b) => {
          if (a.tripId === undefined) return 1;
          if (b.tripId === undefined) return -1;
          return (a.tripName ?? '').localeCompare(b.tripName ?? '');
        }),
    }));
}
