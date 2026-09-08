-- Backfill: all Incident records whose category belongs to the CASA_CLUB
-- catalog domain were created before the `kind` column existed and got the
-- default value 'INCIDENT'. Fix them so the incident-service filter
-- (WHERE kind = 'INCIDENT') stops leaking Casa Club data into the
-- Incidencias screen.
UPDATE "Incident" i
SET    kind = 'CASA_CLUB'
FROM   "IncidentCategory" c
WHERE  i."categoryId" = c.id
  AND  c.type = 'CASA_CLUB'
  AND  i.kind = 'INCIDENT';
