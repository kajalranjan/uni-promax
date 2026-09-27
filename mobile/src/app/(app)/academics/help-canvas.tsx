import { HelpSteps } from '@/components/HelpSteps';

// To add screenshots: save them in mobile/assets/tutorials/ and add
// `image: require('../../../../assets/tutorials/canvas-1.png')` to a step.
export default function HelpCanvas() {
  return (
    <HelpSteps
      intro="Canvas gives you a private link to your calendar. When professors add or change assignments, the link updates on its own, so Uni Promax always stays current."
      steps={[
        { text: 'On a computer, go to canvas.asu.edu and log in. (The link is easiest to find on the Canvas website, not the Canvas app.)' },
        { text: 'Click "Calendar" in the menu on the left side of the page.' },
        { text: 'Scroll to the bottom of the right-hand sidebar and click "Calendar Feed".' },
        { text: 'A box opens with a link that ends in .ics. Copy the whole link.' },
        { text: 'Send the link to your phone (for example, email it to yourself), then paste it into Uni Promax.' },
      ]}
      footer="Keep this link private: anyone who has it can see your Canvas calendar."
    />
  );
}
