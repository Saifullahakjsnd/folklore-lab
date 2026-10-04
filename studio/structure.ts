import type {StructureResolver} from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Folklore Lab')
    .items([
      S.listItem()
        .title('Hypotheses: draft')
        .child(S.documentTypeList('hypothesis').title('Draft').filter('_type == "hypothesis" && (status == "draft" || !defined(status))')),
      S.listItem()
        .title('Hypotheses: pre-registered')
        .child(S.documentTypeList('hypothesis').title('Pre-registered').filter('_type == "hypothesis" && status == "preregistered"')),
      S.listItem()
        .title('Hypotheses: superseded')
        .child(S.documentTypeList('hypothesis').title('Superseded').filter('_type == "hypothesis" && status == "superseded"')),
      S.divider(),
      S.documentTypeListItem('preregistration').title('Pre-registrations (locked)'),
      S.documentTypeListItem('deviation').title('Deviations'),
      S.documentTypeListItem('erratum').title('Errata'),
      S.divider(),
      S.documentTypeListItem('dataSnapshot').title('Data snapshots'),
      S.documentTypeListItem('trial').title('Trials'),
      S.documentTypeListItem('verdict').title('Verdicts'),
      S.divider(),
      S.documentTypeListItem('proverb').title('Proverbs'),
      S.documentTypeListItem('location').title('Locations'),
    ])
