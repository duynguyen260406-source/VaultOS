ALTER TABLE AppUsers
    DROP CHECK chk_appusers_staff_identity,
    DROP CHECK chk_appusers_failed_count;

