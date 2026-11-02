-- Hours are [open_minute, close_minute] in Tucson time, Sunday..Saturday.
-- Sources: rec.arizona.edu (South Rec, North Rec) and tucsonaz.gov (city parks), checked Nov 2026.
insert into public.courts (slug, name, kind, area, address, hours, note, sort_order) values
('south-rec', 'South Rec', 'indoor', 'University of Arizona', '1400 E 6th St, Tucson, AZ 85721',
 '[[480,1440],[360,1440],[360,1440],[360,1440],[360,1440],[360,1380],[480,1380]]',
 'UA Rec membership required. Hours change on game days and breaks.', 1),
('north-rec', 'North Rec', 'indoor', 'University of Arizona', '1051 E Mabel St, Tucson, AZ 85719',
 '[[480,1260],[360,1320],[360,1320],[360,1320],[360,1320],[360,1260],[480,1260]]',
 'UA Rec membership required. One full court that can split into two halves.', 2),
('reid-park', 'Reid Park', 'outdoor', 'Midtown Tucson', '900 S Randolph Way, Tucson, AZ 85716',
 '[[360,1350],[360,1350],[360,1350],[360,1350],[360,1350],[360,1350],[360,1350]]',
 'Public courts, first come first served.', 3),
('himmel-park', 'Himmel Park', 'outdoor', 'Midtown Tucson', '1000 N Tucson Blvd, Tucson, AZ 85716',
 '[[360,1350],[360,1350],[360,1350],[360,1350],[360,1350],[360,1350],[360,1350]]',
 'Half court plus a multi-use court.', 4);
