import { RocketIcon } from '@sanity/icons/Rocket';
import { Box, Button, Card, Container, Dialog, Flex, Heading, Stack, Text } from '@sanity/ui';
import { useCallback, useEffect, useState } from 'react';
import { useClient } from 'sanity';
import { CONTENT_TYPES } from './schemaTypes/index.js';

const DEPLOY_ID = 'deployRequest';

// "raw" sees published documents and drafts as separate documents.
const STATUS_QUERY = `{
  "lastDeploy": *[_id == $id][0].requestedAt,
  "waiting": count(*[
    _type in $types
    && !(_id in path("drafts.**"))
    && _updatedAt > coalesce(*[_id == $id][0].requestedAt, "1970-01-01T00:00:00Z")
  ]),
  "drafts": count(*[_type in $types && _id in path("drafts.**")])
}`;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function DeployTool() {
  const client = useClient({ apiVersion: '2025-02-19' }).withConfig({ perspective: 'raw' });
  const [status, setStatus] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState('idle');

  const refresh = useCallback(
    () => client.fetch(STATUS_QUERY, { id: DEPLOY_ID, types: CONTENT_TYPES }).then(setStatus),
    [client],
  );

  useEffect(() => {
    refresh().catch(() => setState('error'));
  }, [refresh]);

  // A Sanity webhook watches this document and starts the Netlify build, so the
  // build hook URL never reaches the Studio's public code. Only signed-in users
  // with write access can change the document.
  const deploy = async () => {
    setConfirming(false);
    setState('sending');
    try {
      await client.createOrReplace({
        _id: DEPLOY_ID,
        _type: DEPLOY_ID,
        requestedAt: new Date().toISOString(),
      });
      await refresh();
      setState('sent');
    } catch {
      setState('error');
    }
  };

  return (
    <Container width={1} padding={5}>
      <Stack space={5}>
        <Heading as="h1" size={2}>
          Put changes live
        </Heading>

        {status && (
          <Stack space={4}>
            <Text>
              {status.waiting > 0
                ? `${plural(status.waiting, 'published change')} waiting to go live.`
                : 'No published changes are waiting.'}
            </Text>
            {status.drafts > 0 && (
              <Text muted>
                {plural(status.drafts, 'unpublished draft')} won’t go live until published.
              </Text>
            )}
            <Text muted size={1}>
              {status.lastDeploy
                ? `Last requested ${new Date(status.lastDeploy).toLocaleString()}.`
                : 'Nothing has been put live from here yet.'}
            </Text>
          </Stack>
        )}

        <Flex>
          <Button
            icon={RocketIcon}
            text={state === 'sending' ? 'Requesting…' : 'Put changes live'}
            tone="primary"
            disabled={state === 'sending' || !status}
            onClick={() => setConfirming(true)}
          />
        </Flex>

        {state === 'sent' && (
          <Card padding={3} radius={2} tone="positive">
            <Text>Deploy requested. The site usually updates within a few minutes.</Text>
          </Card>
        )}
        {state === 'error' && (
          <Card padding={3} radius={2} tone="critical">
            <Text>That didn’t work. Check that your account can edit content, then try again.</Text>
          </Card>
        )}
      </Stack>

      {confirming && (
        <Dialog
          id="confirm-deploy"
          header="Put changes live?"
          onClose={() => setConfirming(false)}
          width={0}
        >
          <Box padding={4}>
            <Stack space={4}>
              <Text>All published content goes live on the public site.</Text>
              <Flex gap={2} justify="flex-end">
                <Button mode="ghost" text="Cancel" onClick={() => setConfirming(false)} />
                <Button tone="primary" text="Put changes live" onClick={deploy} />
              </Flex>
            </Stack>
          </Box>
        </Dialog>
      )}
    </Container>
  );
}

export const deployTool = {
  name: 'deploy',
  title: 'Put changes live',
  icon: RocketIcon,
  component: DeployTool,
};
