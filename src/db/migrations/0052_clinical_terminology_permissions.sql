-- Platform-admin permissions for global clinical terminology governance.

UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_admins.read","platform_admins.write","platform_procedures.read","platform_procedures.write","platform_clinical_terminology.read","platform_clinical_terminology.write","platform_ai_config.read","platform_ai_config.write","platform_audit.read"]'
WHERE key = 'platform_owner';

UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_procedures.read","platform_procedures.write","platform_clinical_terminology.read","platform_clinical_terminology.write","platform_ai_config.read","platform_audit.read"]'
WHERE key = 'platform_operator';

UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_content.read","platform_config.read","platform_admins.read","platform_procedures.read","platform_clinical_terminology.read","platform_ai_config.read","platform_audit.read"]'
WHERE key = 'platform_auditor';
