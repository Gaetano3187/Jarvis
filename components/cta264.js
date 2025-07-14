import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const CTA264 = (props) => {
  return (
    <>
      <div className="thq-section-padding">
        <div className="thq-section-max-width">
          <div className="cta264-accent2-bg">
            <div className="cta264-accent1-bg">
              <div className="cta264-container2">
                <div className="cta264-content">
                  <span className="thq-heading-2">
                    {props.heading1 ?? (
                      <Fragment>
                        <span className="cta264-text6">
                          Ready to boost your productivity?
                        </span>
                      </Fragment>
                    )}
                  </span>
                  <p className="thq-body-large">
                    {props.content1 ?? (
                      <Fragment>
                        <span className="cta264-text5">
                          Sign up now and start organizing your tasks
                          efficiently.
                        </span>
                      </Fragment>
                    )}
                  </p>
                </div>
                <div className="cta264-actions">
                  <button
                    type="button"
                    className="thq-button-filled cta264-button"
                  >
                    <span>
                      {props.action1 ?? (
                        <Fragment>
                          <span className="cta264-text4">Sign Up</span>
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
          .cta264-accent2-bg {
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
          .cta264-accent2-bg:hover {
            transform: scale3d(1.1, 1.1, 1.1);
          }
          .cta264-accent1-bg {
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
          .cta264-container2 {
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
          .cta264-container2:hover {
            color: var(--dl-color-theme-neutral-light);
            background-color: var(--dl-color-theme-neutral-dark);
          }
          .cta264-content {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-items: flex-start;
            flex-direction: column;
          }
          .cta264-actions {
            gap: var(--dl-layout-space-oneandhalfunits);
            flex: 1;
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
          }
          .cta264-text4 {
            display: inline-block;
          }
          .cta264-text5 {
            display: inline-block;
          }
          .cta264-text6 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .cta264-container2 {
              gap: var(--dl-layout-space-oneandhalfunits);
              flex-direction: column;
              justify-content: flex-start;
            }
          }
          @media (max-width: 479px) {
            .cta264-actions {
              flex-wrap: wrap;
              align-self: stretch;
              justify-content: center;
            }
            .cta264-button {
              flex: 1;
            }
          }
        `}
      </style>
    </>
  )
}

CTA264.defaultProps = {
  action1: undefined,
  content1: undefined,
  heading1: undefined,
}

CTA264.propTypes = {
  action1: PropTypes.element,
  content1: PropTypes.element,
  heading1: PropTypes.element,
}

export default CTA264
