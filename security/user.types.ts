export interface User {
	active: boolean;
	username: string;
	role: UserRole;
	__updatedtime__: number;
	__createdtime__: number;
}

export interface UserRole {
	permission: UserRoleNamedPermissions & UserRoleDatabasePermissions;
	role: string;
	id: string;
	__updatedtime__: number;
	__createdtime__: number;
}

export interface UserRoleNamedPermissions {
	super_user?: boolean;
	cluster_user?: boolean;
	structure_user?: boolean;
}

export interface UserRoleDatabasePermissions extends Partial<CRUDPermissions> {
	[databaseName: string]: boolean | UserRoleSchemaRecord;
}

export interface UserRoleSchemaRecord extends CRUDPermissions {
	tables: Record<string, UserRolePermissionTable | UserLegacyRolePermissionTable>;
}

export interface UserRolePermissionTable extends CRUDPermissions {
	attribute_permissions: UserRoleAttributePermissionTable[];
}

export interface UserRoleAttributePermissionTable extends Omit<CRUDPermissions, 'delete'> {
	attribute_name: string;
}

export interface UserLegacyRolePermissionTable extends CRUDPermissions {
	attribute_restrictions: UserLegacyRoleAttributePermissionTable[];
}

export interface UserLegacyRoleAttributePermissionTable extends CRUDPermissions {
	attribute_name: string;
}

export interface CRUDPermissions {
	read: boolean;
	insert: boolean;
	update: boolean;
	delete: boolean;
}
