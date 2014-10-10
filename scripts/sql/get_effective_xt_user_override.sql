-- Override for getEffectiveXtUser that allows database users to impersonate XT
-- Users.  You must run `SELECT initEffectiveXtUser();` and `SELECT
-- setEffectiveXtUser('username');` before this will return anything but the
-- current user.
CREATE OR REPLACE FUNCTION getEffectiveXtUser() RETURNS TEXT AS $$
  BEGIN
    PERFORM *
       FROM pg_catalog.pg_class
      WHERE relname = 'effective_user'
        AND relnamespace = pg_catalog.pg_my_temp_schema();

    IF NOT FOUND THEN
      RETURN CURRENT_USER;
    ELSE
      RETURN COALESCE(
        ( SELECT effective_value
          FROM effective_user 
          LIMIT 1 ),
        CURRENT_USER
      );
    END IF;
  END;
$$ LANGUAGE plpgsql;
