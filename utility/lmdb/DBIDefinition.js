'use strict';

/**
 * used to define specific attributes of a dbi.
 * dupSort for allowing duplicate keys, or not
 * intKey defines if the key entries are integers or not
 */
class DBIDefinition {
	/**
	 * @param {Boolean} dupSort - allow duplicate keys, or not
	 * @param {Boolean} isHashAttribute - defines if this attribute is a hash attribute
	 */
	constructor(dupSort = false, isPrimaryKey = false) {
		this.dup_sort = dupSort;
		this.isPrimaryKey = isPrimaryKey;
		this.useVersions = isPrimaryKey;
	}
}

module.exports = DBIDefinition;
