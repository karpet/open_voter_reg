import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { map, has } from 'lodash';
import { DuplicateRegistrationError, AuthError } from '../errors';

class UserModel {
  register = async ({ email, password, first_name, last_name }, ctx) => {
    // search db for matching emails
    const prevUser = await ctx.connectors.user.userByEmail.load(email);
    if (prevUser) {
      throw new DuplicateRegistrationError({ data: { email } });
    }

    const hash = bcrypt.hashSync(password, 10);
    const newUser = await ctx.connectors.user.createNewUser({
      email,
      password,
      first_name,
      last_name,
      password: hash,
    });

    return await ctx.connectors.user.userByEmail
      .clear(email)
      .prime(email, newUser[0])
      .load(email);
  };

  login = async ({ email, password }, ctx) => {
    // hit DB for accounts with that email
    const dbUserRecord = await ctx.connectors.user.userByEmail.load(email);
    if (!dbUserRecord) {
      throw new AuthError();
    }
    if (!bcrypt.compareSync(password, dbUserRecord.password)) {
      throw new AuthError();
    }
    const userServicePermissionsRaw = await ctx.connectors.organizationPermissions.permissionsByEmail.load(
      email
    );

    const permsByService = {};
    map(userServicePermissionsRaw, permission => {
      // permsByService[permission.service_id] = permission.permission;
      if (has(permsByService, permission.service_id)) {
        permsByService[permission.org_hash].push(permission.permission);
      } else {
        permsByService[permission.org_hash] = [permission.permission];
      }
    });

    const tokenPayload = {
      email,
      permissions: permsByService,
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET);
    return {
      userProfile: dbUserRecord,
      token,
    };
  };
}

export default UserModel;
