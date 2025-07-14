import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const CTA4 = (props) => {
  return (
    <>
      <div className="cta4-container1 thq-section-padding">
        <div className="cta4-max-width thq-section-max-width">
          <div className="cta4-container2 thq-flex-row">
            <div className="cta4-column">
              <span className="thq-heading-2">
                {props.content1 ?? (
                  <Fragment>
                    <span className="cta4-text8">
                      Join our community of fitness enthusiasts!
                    </span>
                  </Fragment>
                )}
              </span>
              <p className="thq-body-small">
                {props.content2 ?? (
                  <Fragment>
                    <span className="cta4-text7">
                      Get access to exclusive workout plans and nutrition tips
                    </span>
                  </Fragment>
                )}
              </p>
              <div className="cta4-actions">
                <button type="button" className="thq-button-filled">
                  <span>
                    {props.action1 ?? (
                      <Fragment>
                        <span className="cta4-text6">Sign Up Now</span>
                      </Fragment>
                    )}
                  </span>
                </button>
                <button type="button" className="thq-button-outline">
                  <span>
                    {props.action2 ?? (
                      <Fragment>
                        <span className="cta4-text5">Explore Plans</span>
                      </Fragment>
                    )}
                  </span>
                </button>
              </div>
            </div>
            <img
              alt={props.image1Alt}
              src={props.image1Src}
              className="cta4-placeholder-image thq-img-ratio-16-9"
            />
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .cta4-container1 {
            width: 100%;
            height: auto;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .cta4-max-width {
            gap: 80px;
            width: 100%;
            height: auto;
            display: flex;
            overflow: hidden;
            max-width: var(--dl-layout-size-maxwidth);
            align-self: center;
            align-items: flex-start;
            flex-shrink: 0;
            flex-direction: column;
          }
          .cta4-container2 {
            align-self: stretch;
            align-items: center;
            flex-shrink: 0;
          }
          .cta4-column {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            flex-grow: 1;
            align-items: flex-start;
            flex-direction: column;
          }
          .cta4-actions {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-items: flex-start;
          }
          .cta4-placeholder-image {
            height: 100%;
            flex-grow: 1;
            max-height: 400px;
          }
          .cta4-text5 {
            display: inline-block;
          }
          .cta4-text6 {
            display: inline-block;
          }
          .cta4-text7 {
            display: inline-block;
          }
          .cta4-text8 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .cta4-container2 {
              flex-direction: column;
            }
            .cta4-placeholder-image {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

CTA4.defaultProps = {
  image1Alt: 'Fitness Community',
  action2: undefined,
  action1: undefined,
  image1Src:
    'https://images.unsplash.com/photo-1552083974-186346191183?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDE1fHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1400',
  content2: undefined,
  content1: undefined,
}

CTA4.propTypes = {
  image1Alt: PropTypes.string,
  action2: PropTypes.element,
  action1: PropTypes.element,
  image1Src: PropTypes.string,
  content2: PropTypes.element,
  content1: PropTypes.element,
}

export default CTA4
