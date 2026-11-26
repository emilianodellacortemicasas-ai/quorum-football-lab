-- Birmingham City – Bolton Wanderers: Italian feed had home and away inverted (1X carried the X2 price).
-- The pick was a data error, not a real proposal: removed from the method's register.
DELETE FROM scanner_tickets WHERE kind LIKE 'tipster%' AND legs LIKE '%Birmingham City – Bolton Wanderers%';
