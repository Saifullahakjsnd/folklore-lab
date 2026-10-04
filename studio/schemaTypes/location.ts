import {defineField, defineType} from 'sanity'

export const location = defineType({
  name: 'location',
  title: 'Location',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'lat', title: 'Latitude', type: 'number', validation: (r) => r.required().min(-90).max(90)}),
    defineField({name: 'lon', title: 'Longitude', type: 'number', validation: (r) => r.required().min(-180).max(180)}),
    defineField({
      name: 'timeZone',
      title: 'IANA time zone',
      type: 'string',
      validation: (r) =>
        r.required().custom((tz) => {
          if (!tz) return true
          try {
            new Intl.DateTimeFormat('en', {timeZone: tz})
            return true
          } catch {
            return `"${tz}" is not an IANA time zone`
          }
        }),
    }),
    defineField({name: 'coordinateSource', type: 'citation', validation: (r) => r.required()}),
  ],
  preview: {
    select: {title: 'name', lat: 'lat', lon: 'lon', tz: 'timeZone'},
    prepare: ({title, lat, lon, tz}) => ({title, subtitle: `${lat}, ${lon} · ${tz}`}),
  },
})
