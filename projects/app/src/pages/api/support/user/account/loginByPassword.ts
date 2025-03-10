import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { PostLoginProps } from '@fastgpt/global/support/user/api.d';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { useReqFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username, password } = req.body as PostLoginProps;

  if (!username || !password) {
    throw new Error('缺少参数');
  }

  // 检测用户是否存在
  const authCert = await MongoUser.findOne(
    {
      username
    },
    'status'
  );
  if (!authCert) {
    throw new Error('用户未注册');
  }

  if (authCert.status === UserStatusEnum.forbidden) {
    throw new Error('账号已停用，无法登录');
  }

  const user = await MongoUser.findOne({
    username,
    password
  });

  if (!user) {
    throw new Error('密码错误');
  }

  const userDetail = await getUserDetail({
    tmbId: user?.lastLoginTmbId,
    userId: user._id
  });

  MongoUser.findByIdAndUpdate(user._id, {
    lastLoginTmbId: userDetail.team.tmbId
  });

  pushTrack.login({
    type: 'password',
    uid: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId
  });

  const token = createJWT({
    ...userDetail,
    isRoot: username === 'root'
  });

  setCookie(res, token);

  return {
    user: userDetail,
    token
  };
}

export default NextAPI(useReqFrequencyLimit(120, 10), handler);
