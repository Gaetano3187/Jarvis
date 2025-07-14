import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const CTA261 = (props) => {
  return (
    <>
      <div className="thq-section-padding">
        <div className="thq-section-max-width">
          <div className="cta261-accent2-bg">
            <div className="cta261-accent1-bg">
              <div className="cta261-container2">
                <div className="cta261-content">
                  <span className="thq-heading-2">
                    {props.heading1 ?? (
                      <Fragment>
                        <span className="cta261-text4">
                          Ready to boost your productivity?
                        </span>
                      </Fragment>
                    )}
                  </span>
                  <p className="thq-body-large">
                    {props.content1 ?? (
                      <Fragment>
                        <span className="cta261-text5">
                          Sign up now and start organizing your tasks
                          efficiently.
                        </span>
                      </Fragment>
                    )}
                  </p>
                </div>
                <div className="cta261-actions">
                  <button
                    type="button"
                    className="thq-button-filled cta261-button"
                  >
                    <span>
                      {props.action1 ?? (
                        <Fragment>
                          <span className="cta261-text6">Sign Up Now</span>
                        </Fragment>
                      )}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .cta261-accent2-bg {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            transform: translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg)
              rotateY(0deg) rotateZ(1deg) skew(0deg, 0deg);
            align-self: stretch;
            transition: 0.3s;
            align-items: center;
            border-radius: var(--dl-layout-radius-cardradius);
            justify-content: space-between;
            transform-style: preserve-3d;
            background-color: var(--dl-color-theme-accent2);
          }
          .cta261-accent2-bg:hover {
            transform: scale3d(1.1, 1.1, 1.1);
          }
          .cta261-accent1-bg {
            width: 100%;
            display: flex;
            transform: translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg)
              rotateY(0deg) rotateZ(-2deg) skew(0deg, 0deg);
            align-items: center;
            border-radius: var(--dl-layout-radius-cardradius);
            justify-content: space-between;
            transform-style: preserve-3d;
            background-color: var(--dl-color-theme-accent1);
          }
          .cta261-container2 {
            gap: var(--dl-layout-space-threeunits);
            width: 100%;
            display: flex;
            transform: translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg)
              rotateY(0deg) rotateZ(1deg) skew(0deg, 0deg);
            transition: 0.3s;
            align-items: center;
            padding-top: var(--dl-layout-space-sixunits);
            padding-left: var(--dl-layout-space-fourunits);
            border-radius: var(--dl-layout-radius-cardradius);
            padding-right: var(--dl-layout-space-fourunits);
            padding-bottom: var(--dl-layout-space-sixunits);
          }
          .cta261-container2:hover {
            color: var(--dl-color-theme-neutral-light);
            background-color: var(--dl-color-theme-neutral-dark);
          }
          .cta261-content {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-items: flex-start;
            flex-direction: column;
          }
          .cta261-actions {
            gap: var(--dl-layout-space-oneandhalfunits);
            flex: 1;
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
          }
          .cta261-text4 {
            display: inline-block;
          }
          .cta261-text5 {
            display: inline-block;
          }
          .cta261-text6 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .cta261-container2 {
              gap: var(--dl-layout-space-oneandhalfunits);
              flex-direction: column;
              justify-content: flex-start;
            }
          }
          @media (max-width: 479px) {
            .cta261-actions {
              flex-wrap: wrap;
              align-self: stretch;
              justify-content: center;
            }
            .cta261-button {
              flex: 1;
            }
          }
        `}
      </style>
    </>
  )
}

CTA261.defaultProps = {
  heading1: undefined,
  content1: undefined,
  action1: undefined,
}

CTA261.propTypes = {
  heading1: PropTypes.element,
  content1: PropTypes.element,
  action1: PropTypes.element,
}

export default CTA261
