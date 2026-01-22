-- Add RLS policies for admins to manage ALL support tickets and messages

-- Allow admins to view ALL support tickets
CREATE POLICY "Admins can view all tickets"
ON public.support_tickets FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update ALL support tickets (change status, priority, etc.)
CREATE POLICY "Admins can update all tickets"
ON public.support_tickets FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view ALL support messages
CREATE POLICY "Admins can view all messages"
ON public.support_messages FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert messages into ANY ticket (as admin responses)
CREATE POLICY "Admins can insert messages"
ON public.support_messages FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));